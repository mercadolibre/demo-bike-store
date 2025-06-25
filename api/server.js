require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const sanitizeFilename = require('sanitize-filename');
const FormData = require('form-data');
const MLAuthService = require('./ml-auth');
const MLCategoryService = require('./ml-category');
const fetch = require('node-fetch');
const sharp = require('sharp');

const app = express();
const DB_PATH = path.join(__dirname, 'db.json');
const CATEGORIES_PATH = path.join(__dirname, 'categories.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Initialize MercadoLibre Auth Service
const mlAuth = new MLAuthService();
const mlCategory = new MLCategoryService(mlAuth);

// Global database object
let db = { products: [] };

// Load database on startup
function loadDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db.products = JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db.products = [];
    }
}

// Save database to file
function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db.products, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Load database on startup
loadDatabase();

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        try {
            // Sanitize the original filename
            const sanitizedBasename = sanitizeAndValidateFilename(
                path.parse(file.originalname).name
            );
            const extension = path.extname(file.originalname).toLowerCase();

            // Generate unique filename with timestamp and sanitized original name
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const safeFilename = `${uniqueSuffix}-${sanitizedBasename}${extension}`;

            cb(null, safeFilename);
        } catch (error) {
            cb(new Error(`Invalid filename: ${error.message}`), null);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        try {
            // Validate file extension
            const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
            const fileExtension = path.extname(file.originalname).toLowerCase();

            if (!allowedExtensions.includes(fileExtension)) {
                return cb(new Error('Only image files (jpg, jpeg, png, gif) are allowed!'), false);
            }

            // Validate filename can be sanitized
            sanitizeAndValidateFilename(file.originalname);

            cb(null, true);
        } catch (error) {
            cb(new Error(`File validation failed: ${error.message}`), false);
        }
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper function to read products from db.json
const readProducts = (callback) => {
    fs.readFile(DB_PATH, 'utf8', (err, data) => {
        if (err) {
            callback(err, null);
            return;
        }
        try {
            const products = JSON.parse(data);
            callback(null, products);
        } catch (parseError) {
            callback(parseError, null);
        }
    });
};

// Helper function to write products to db.json
const writeProducts = (products, callback) => {
    fs.writeFile(DB_PATH, JSON.stringify(products, null, 2), 'utf8', callback);
};

// Helper function to read categories from categories.json
const readCategories = (callback) => {
    fs.readFile(CATEGORIES_PATH, 'utf8', (err, data) => {
        if (err) {
            callback(err, null);
            return;
        }
        try {
            const categoriesData = JSON.parse(data);
            callback(null, categoriesData.categories);
        } catch (parseError) {
            callback(parseError, null);
        }
    });
};

// Helper function to write categories to categories.json
const writeCategories = (categories, callback) => {
    const data = { categories };
    fs.writeFile(CATEGORIES_PATH, JSON.stringify(data, null, 2), 'utf8', callback);
};

// Security functions for path traversal preventionAdd commentMore actions
function sanitizeAndValidateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename provided');
    }

    // Check for absolute paths early
    if (path.isAbsolute(filename)) {
        throw new Error('Absolute paths are not allowed');
    }

    // Check for reserved names BEFORE sanitization to handle them properly
    const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
    const nameWithoutExt = path.parse(filename).name.toLowerCase();

    let filenameToSanitize = filename;
    if (reservedNames.includes(nameWithoutExt)) {
        // Prefix reserved names before sanitization
        const ext = path.extname(filename);
        filenameToSanitize = `safe_${path.parse(filename).name}${ext}`;
    }

    // Sanitize the filename to remove dangerous characters
    const sanitized = sanitizeFilename(filenameToSanitize);

    // Additional validation: ensure it's not empty after sanitization
    if (!sanitized || sanitized.trim() === '') {
        throw new Error('Filename becomes empty after sanitization');
    }

    // Ensure the filename doesn't contain path separators or parent directory references
    if (sanitized.includes('/') || sanitized.includes('\\') || sanitized.includes('..')) {
        throw new Error('Filename contains invalid path characters');
    }

    return sanitized;
}

function validateSecurePath(basePath, userProvidedPath) {
    try {
        // Handle null/undefined input
        if (!userProvidedPath || typeof userProvidedPath !== 'string') {
            throw new Error('Invalid path provided');
        }

        // Additional early validation for obviously malicious paths
        if (userProvidedPath.includes('..') || userProvidedPath.startsWith('/') || userProvidedPath.startsWith('\\')) {
            throw new Error('Potentially dangerous path detected');
        }

        // Sanitize the user-provided path component
        const sanitizedPath = sanitizeAndValidateFilename(userProvidedPath);

        // Create the full path using path.join
        const fullPath = path.join(basePath, sanitizedPath);

        // Resolve to absolute path to eliminate any .. or . references
        const resolvedPath = path.resolve(fullPath);
        const resolvedBasePath = path.resolve(basePath);

        // Ensure the resolved path is still within the base directory
        if (!resolvedPath.startsWith(resolvedBasePath + path.sep) && resolvedPath !== resolvedBasePath) {
            throw new Error('Path traversal attempt detected');
        }

        return resolvedPath;
    } catch (error) {
        throw new Error(`Path validation failed: ${error.message}`);
    }
}

// MercadoLibre Authentication Endpoints

// Get authorization URL
app.get('/api/ml/auth/url', (req, res) => {
    try {
        const { authUrl, state } = mlAuth.getAuthorizationUrl();
        res.json({ authUrl, state });
    } catch (error) {
        console.error('Error generating auth URL:', error.message);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

// Handle OAuth callback
app.get('/api/ml/auth/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            return res.redirect(`/admin?ml_error=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
            return res.redirect('/admin?ml_error=missing_parameters');
        }

        await mlAuth.exchangeCodeForTokens(code, state);
        res.redirect('/admin?ml_success=true');
    } catch (error) {
        console.error('OAuth callback error:', error.message);
        res.redirect(`/admin?ml_error=${encodeURIComponent(error.message)}`);
    }
});

// Get authentication status
app.get('/api/ml/auth/status', (req, res) => {
    try {
        const tokenInfo = mlAuth.getTokenInfo();
        res.json(tokenInfo);
    } catch (error) {
        console.error('Error getting auth status:', error.message);
        res.status(500).json({ error: 'Failed to get authentication status' });
    }
});

// Refresh token
app.post('/api/ml/auth/refresh', async (req, res) => {
    try {
        const tokens = await mlAuth.refreshToken();
        res.json({ success: true, expires_in: tokens.expires_in });
    } catch (error) {
        console.error('Error refreshing token:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Logout (clear tokens)
app.post('/api/ml/auth/logout', (req, res) => {
    try {
        mlAuth.clearTokens();
        res.json({ success: true });
    } catch (error) {
        console.error('Error during logout:', error.message);
        res.status(500).json({ error: 'Failed to logout' });
    }
});

// Get user info
app.get('/api/ml/user', async (req, res) => {
    try {
        const userInfo = await mlAuth.getUserInfo();
        res.json(userInfo);
    } catch (error) {
        console.error('Error getting user info:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Get marketplace info
app.get('/api/ml/marketplace', async (req, res) => {
    try {
        const marketplaceInfo = await mlAuth.getMarketplaceInfo();
        res.json(marketplaceInfo);
    } catch (error) {
        console.error('Error getting marketplace info:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// MercadoLibre Category Discovery Endpoints

// Save MercadoLibre configuration for a product
app.post('/api/products/:productId/ml-config', (req, res) => {
    const productId = parseInt(req.params.productId);
    const mlConfig = req.body;

    const productIndex = db.products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }

    // Add ML configuration to the product
    db.products[productIndex].mercadoLibreConfig = mlConfig;

    // Save to file
    saveDatabase();

    res.json({
        success: true,
        message: 'ML configuration saved successfully',
        product: db.products[productIndex]
    });
});

// Get MercadoLibre configuration for a product
app.get('/api/products/:productId/ml-config', (req, res) => {
    const productId = parseInt(req.params.productId);

    const product = db.products.find(p => p.id === productId);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
        success: true,
        config: product.mercadoLibreConfig || null
    });
});

// Predict categories for a product
app.post('/api/ml/categories/predict', async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Product title is required' });
        }

        const predictions = await mlCategory.predictCategories(title, description);
        res.json(predictions);
    } catch (error) {
        console.error('Error predicting categories:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Get root categories for site
app.get('/api/ml/categories', async (req, res) => {
    try {
        const rootCategories = await mlCategory.getRootCategories();
        res.json(rootCategories);
    } catch (error) {
        console.error('Error getting root categories:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Get category details
app.get('/api/ml/categories/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const categoryDetails = await mlCategory.getCategoryDetails(categoryId);
        res.json(categoryDetails);
    } catch (error) {
        console.error('Error getting category details:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Get category attributes
app.get('/api/ml/categories/:categoryId/attributes', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const attributes = await mlCategory.getCategoryAttributes(categoryId);
        res.json(attributes);
    } catch (error) {
        console.error('Error getting category attributes:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Search categories manually
app.get('/api/ml/categories/search', async (req, res) => {
    try {
        const { q: query } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchResults = await mlCategory.searchCategories(query);
        res.json(searchResults);
    } catch (error) {
        console.error('Error searching categories:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Get category hierarchy
app.get('/api/ml/categories/:categoryId/hierarchy', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const hierarchy = await mlCategory.getCategoryHierarchy(categoryId);
        res.json(hierarchy);
    } catch (error) {
        console.error('Error getting category hierarchy:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Validate category for listing
app.get('/api/ml/categories/:categoryId/validate', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const validation = await mlCategory.validateCategoryForListing(categoryId);
        res.json(validation);
    } catch (error) {
        console.error('Error validating category:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// API endpoint to get all products
app.get('/api/products', (req, res) => {
    readProducts((err, products) => {
        if (err) {
            console.error('Error reading db.json for GET /api/products:', err);
            return res.status(500).json({ error: 'Failed to load products' });
        }
        res.json(products);
    });
});

// API endpoint to get a single product by ID
app.get('/api/products/:id', (req, res) => {
    readProducts((err, products) => {
        if (err) {
            console.error('Error reading db.json for GET /api/products/:id:', err);
            return res.status(500).json({ error: 'Failed to load product' });
        }
        const product = products.find(p => p.id === parseInt(req.params.id));
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    });
});

// API endpoint to create a new product
app.post('/api/products', (req, res) => {
    readProducts((err, products) => {
        if (err) {
            console.error('Error reading db.json for POST /api/products:', err);
            return res.status(500).json({ error: 'Failed to process product creation' });
        }
        const newProduct = req.body;
        // Simple ID generation: find max ID and add 1
        const maxId = products.reduce((max, p) => p.id > max ? p.id : max, 0);
        newProduct.id = maxId + 1;

        // Basic validation (can be expanded)
        if (!newProduct.name || !newProduct.variants || !newProduct.variants[0] || typeof newProduct.variants[0].price === 'undefined') {
            return res.status(400).json({ error: 'Missing required product fields (name, variants with price)' });
        }

        // Ensure images array exists
        if (!newProduct.images) {
            newProduct.images = [];
        }

        products.push(newProduct);
        writeProducts(products, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to db.json for POST /api/products:', writeErr);
                return res.status(500).json({ error: 'Failed to save new product' });
            }

            // Reload global db object to keep it in sync
            loadDatabase();

            res.status(201).json(newProduct);
        });
    });
});

// API endpoint to update an existing product by ID
app.put('/api/products/:id', (req, res) => {
    readProducts((err, products) => {
        if (err) {
            console.error('Error reading db.json for PUT /api/products/:id:', err);
            return res.status(500).json({ error: 'Failed to process product update' });
        }
        const productId = parseInt(req.params.id);
        const productIndex = products.findIndex(p => p.id === productId);
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const updatedProductData = req.body;

        // Basic validation (can be expanded)
        if (!updatedProductData.name || !updatedProductData.variants || !updatedProductData.variants[0] || typeof updatedProductData.variants[0].price === 'undefined') {
            return res.status(400).json({ error: 'Missing required product fields (name, variants with price)' });
        }

        // Ensure images array exists
        if (!updatedProductData.images) {
            updatedProductData.images = [];
        }

        // Keep the original ID
        products[productIndex] = { ...products[productIndex], ...updatedProductData, id: productId };

        writeProducts(products, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to db.json for PUT /api/products/:id:', writeErr);
                return res.status(500).json({ error: 'Failed to update product' });
            }

            // Reload global db object to keep it in sync
            loadDatabase();

            res.json(products[productIndex]);
        });
    });
});

// API endpoint to delete a product by ID
app.delete('/api/products/:id', (req, res) => {
    readProducts((err, products) => {
        if (err) {
            console.error('Error reading db.json for DELETE /api/products/:id:', err);
            return res.status(500).json({ error: 'Failed to process product deletion' });
        }
        const productId = parseInt(req.params.id);
        const product = products.find(p => p.id === productId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete associated images if they exist
        if (product.images && Array.isArray(product.images)) {
            product.images.forEach(image => {
                if (image.filename) {
                    try {
                        // Use secure path validation for image deletion
                        const imagePath = validateSecurePath(UPLOADS_DIR, image.filename);

                        if (fs.existsSync(imagePath)) {
                            fs.unlinkSync(imagePath);
                        }
                    } catch (error) {
                        console.error(`Failed to delete image ${image.filename}:`, error.message);
                    }
                }
            });
        }

        const filteredProducts = products.filter(p => p.id !== productId);
        writeProducts(filteredProducts, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to db.json for DELETE /api/products/:id:', writeErr);
                return res.status(500).json({ error: 'Failed to delete product' });
            }

            // Reload global db object to keep it in sync
            loadDatabase();

            res.status(204).send();
        });
    });
});

// API endpoint to upload images
app.post('/api/upload', upload.array('images', 5), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            src: `/uploads/${file.filename}`
        }));

        res.json(uploadedFiles);
    } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
});

// API endpoint to delete an image
app.delete('/api/images/:filename', (req, res) => {
    try {
        const filename = req.params.filename;

        // Validate and secure the filepath to prevent path traversal
        const filepath = validateSecurePath(UPLOADS_DIR, filename);

        // Check if file exists
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // Additional security: ensure the file is actually an image
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
        const fileExtension = path.extname(filepath).toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            return res.status(400).json({ error: 'Invalid file type for deletion' });
        }

        // Delete file
        fs.unlink(filepath, (err) => {
            if (err) {
                console.error('Error deleting image:', err);
                return res.status(500).json({ error: 'Failed to delete image' });
            }
            res.status(204).send();
        });

    } catch (error) {
        console.error('Security error in image deletion:', error.message);
        return res.status(400).json({ error: 'Invalid filename or security violation' });
    }
});

// API Endpoints for Categories
app.get('/api/categories', (req, res) => {
    readCategories((err, categories) => {
        if (err) {
            console.error('Error reading categories.json:', err);
            return res.status(500).json({ error: 'Failed to load categories' });
        }
        res.json(categories);
    });
});

app.post('/api/categories', (req, res) => {
    const newCategory = req.body;

    // Validate required fields
    if (!newCategory.name || !newCategory.name.es) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    readCategories((err, categories) => {
        if (err) {
            console.error('Error reading categories.json:', err);
            return res.status(500).json({ error: 'Failed to process category creation' });
        }

        // Generate new category ID
        const maxId = categories.reduce((max, cat) => cat.id > max ? cat.id : max, 0);
        newCategory.id = maxId + 1;

        // Set default values
        newCategory.description = newCategory.description || { es: '' };
        newCategory.handle = newCategory.handle || {
            es: newCategory.name.es.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '')
        };
        newCategory.subcategories = newCategory.subcategories || [];
        newCategory.created_at = new Date().toISOString();
        newCategory.updated_at = new Date().toISOString();

        // Update parent category if specified
        if (newCategory.parent) {
            const parentCategory = categories.find(cat => cat.id === parseInt(newCategory.parent));
            if (parentCategory) {
                if (!parentCategory.subcategories) {
                    parentCategory.subcategories = [];
                }
                parentCategory.subcategories.push(newCategory.id);
            }
        }

        categories.push(newCategory);
        writeCategories(categories, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to categories.json:', writeErr);
                return res.status(500).json({ error: 'Failed to save new category' });
            }
            res.status(201).json(newCategory);
        });
    });
});

app.put('/api/categories/:id', (req, res) => {
    const categoryId = parseInt(req.params.id);
    const updatedCategory = req.body;

    if (!updatedCategory.name || !updatedCategory.name.es) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    readCategories((err, categories) => {
        if (err) {
            console.error('Error reading categories.json:', err);
            return res.status(500).json({ error: 'Failed to process category update' });
        }

        const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Update the category
        const oldCategory = categories[categoryIndex];
        categories[categoryIndex] = {
            ...oldCategory,
            ...updatedCategory,
            id: categoryId,
            updated_at: new Date().toISOString()
        };

        // Handle parent category changes
        if (updatedCategory.parent !== oldCategory.parent) {
            // Remove from old parent's subcategories
            if (oldCategory.parent) {
                const oldParent = categories.find(cat => cat.id === oldCategory.parent);
                if (oldParent && oldParent.subcategories) {
                    oldParent.subcategories = oldParent.subcategories.filter(id => id !== categoryId);
                }
            }

            // Add to new parent's subcategories
            if (updatedCategory.parent) {
                const newParent = categories.find(cat => cat.id === parseInt(updatedCategory.parent));
                if (newParent) {
                    if (!newParent.subcategories) {
                        newParent.subcategories = [];
                    }
                    if (!newParent.subcategories.includes(categoryId)) {
                        newParent.subcategories.push(categoryId);
                    }
                }
            }
        }

        writeCategories(categories, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to categories.json:', writeErr);
                return res.status(500).json({ error: 'Failed to update category' });
            }
            res.json(categories[categoryIndex]);
        });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    const categoryId = parseInt(req.params.id);

    readCategories((err, categories) => {
        if (err) {
            console.error('Error reading categories.json:', err);
            return res.status(500).json({ error: 'Failed to process category deletion' });
        }

        const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const category = categories[categoryIndex];

        // Remove from parent's subcategories
        if (category.parent) {
            const parentCategory = categories.find(cat => cat.id === category.parent);
            if (parentCategory && parentCategory.subcategories) {
                parentCategory.subcategories = parentCategory.subcategories.filter(id => id !== categoryId);
            }
        }

        // Remove the category
        categories.splice(categoryIndex, 1);

        writeCategories(categories, (writeErr) => {
            if (writeErr) {
                console.error('Error writing to categories.json:', writeErr);
                return res.status(500).json({ error: 'Failed to delete category' });
            }
            res.status(204).send();
        });
    });
});

// Route for the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Route for the product detail page
app.get('/product-detail.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/product-detail.html'));
});

// Route for the admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Migrate product to MercadoLibre
app.post('/api/ml/products/:productId/migrate', async (req, res) => {
    try {
        const productId = parseInt(req.params.productId);

        // Check if user is authenticated
        if (!mlAuth.tokens.access_token) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado con MercadoLibre'
            });
        }

        // Get product data
        const product = db.products.find(p => p.id === productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Get ML configuration
        if (!product.mercadoLibreConfig || !product.mercadoLibreConfig.configured) {
            return res.status(400).json({
                success: false,
                error: 'Producto no configurado para MercadoLibre'
            });
        }

        const mlConfig = product.mercadoLibreConfig;

        console.log(`\n=== MIGRATING SINGLE PRODUCT ${productId}: ${product.name.es} ===`);
        console.log('ML Configuration:', JSON.stringify(mlConfig, null, 2));

        // Step 1: Upload images to MercadoLibre
        let mlPictures = [];
        if (product.images && product.images.length > 0) {
            console.log('Uploading images to MercadoLibre...');
            mlPictures = await uploadImagesToML(product.images);
            console.log('Uploaded images:', mlPictures);
        }

        // Step 2: Build attributes with proper format (value_id + value_name)
        const mlAttributes = await buildMLAttributesWithIds(mlConfig.category.id, mlConfig.attributes, mlConfig.identifiers.gtin);
        console.log('Built attributes:', JSON.stringify(mlAttributes, null, 2));

        // Debug: Check specifically for WEIGHT attribute
        const weightAttr = mlAttributes.find(attr => attr.id === 'WEIGHT');
        if (weightAttr) {
            console.log('DEBUG: WEIGHT attribute in final array:', weightAttr);
        } else {
            console.log('DEBUG: No WEIGHT attribute found in final attributes array');
        }

        // Step 3: Create listing data following official format
        const listingData = {
            title: product.name.es,
            category_id: mlConfig.category.id,
            price: parseFloat(mlConfig.pricing.price),
            currency_id: 'COP',
            available_quantity: parseInt(mlConfig.inventory.availableQuantity),
            condition: 'new',
            listing_type_id: mlConfig.pricing.listingType || 'gold_special',
            description: {
                plain_text: createCleanDescription(product.description.es) || 'Descripción del producto'
            },
            pictures: mlPictures,
            attributes: mlAttributes,
            // sale_terms removed (warranty section)
        };

        console.log('Final Listing Data Payload:', JSON.stringify(listingData, null, 2));

        // Step 4: Create listing on MercadoLibre
        const mlResponse = await fetch('https://api.mercadolibre.com/items', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${mlAuth.tokens.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(listingData)
        });

        const mlResult = await mlResponse.json();

        console.log(`ML Response Status: ${mlResponse.status}`);
        console.log('ML Response Data:', JSON.stringify(mlResult, null, 2));

        if (!mlResponse.ok) {
            console.error(`\n❌ SINGLE MIGRATION FAILED for product ${productId}:`);
            console.error('Status:', mlResponse.status);
            console.error('Error Details:', JSON.stringify(mlResult, null, 2));

            // Extract detailed error information
            let errorMessage = mlResult.message || 'Error desconocido';
            let errorDetails = '';

            if (mlResult.cause && Array.isArray(mlResult.cause)) {
                errorDetails = mlResult.cause.map(cause => {
                    if (cause.code && cause.description) {
                        return `${cause.code}: ${cause.description}`;
                    }
                    return JSON.stringify(cause);
                }).join('; ');
                errorMessage += ` (${errorDetails})`;
            } else if (mlResult.error) {
                errorMessage += ` (${mlResult.error})`;
            }

            return res.status(400).json({
                success: false,
                error: `Error de MercadoLibre: ${errorMessage}`,
                mlErrorCode: mlResult.error || mlResult.status,
                mlErrorDetails: mlResult.cause || mlResult.message,
                requestPayload: listingData // Include the request payload for debugging
            });
        }

        console.log(`✅ SINGLE MIGRATION SUCCESSFUL for product ${productId}`);
        console.log('ML Item ID:', mlResult.id);
        console.log('ML Permalink:', mlResult.permalink);

        // Update product with migration info
        product.mercadoLibreConfig.migrated = true;
        product.mercadoLibreConfig.mlItemId = mlResult.id;
        product.mercadoLibreConfig.mlPermalink = mlResult.permalink;
        product.mercadoLibreConfig.migratedAt = new Date().toISOString();

        // Save updated database
        saveDatabase();

        res.json({
            success: true,
            mlItemId: mlResult.id,
            permalink: mlResult.permalink,
            message: 'Producto migrado exitosamente a MercadoLibre'
        });

    } catch (error) {
        console.error('Error migrating product:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor durante la migración'
        });
    }
});

// Batch migrate products to MercadoLibre
app.post('/api/ml/products/batch-migrate', async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Lista de IDs de productos requerida'
            });
        }

        // Check if user is authenticated
        if (!mlAuth.tokens.access_token) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado con MercadoLibre'
            });
        }

        const results = {
            successful: [],
            failed: [],
            total: productIds.length
        };

        // Process each product
        for (const productId of productIds) {
            try {
                const product = db.products.find(p => p.id === parseInt(productId));

                if (!product) {
                    results.failed.push({
                        productId,
                        error: 'Producto no encontrado'
                    });
                    continue;
                }

                if (!product.mercadoLibreConfig || !product.mercadoLibreConfig.configured) {
                    results.failed.push({
                        productId,
                        productName: product.name.es,
                        error: 'Producto no configurado para MercadoLibre'
                    });
                    continue;
                }

                if (product.mercadoLibreConfig.migrated) {
                    results.failed.push({
                        productId,
                        productName: product.name.es,
                        error: 'Producto ya migrado'
                    });
                    continue;
                }

                const mlConfig = product.mercadoLibreConfig;

                console.log(`\n=== MIGRATING BATCH PRODUCT ${productId}: ${product.name.es} ===`);
                console.log('ML Configuration:', JSON.stringify(mlConfig, null, 2));

                // Step 1: Upload images to MercadoLibre
                let mlPictures = [];
                if (product.images && product.images.length > 0) {
                    console.log('Uploading images to MercadoLibre...');
                    mlPictures = await uploadImagesToML(product.images);
                    console.log('Uploaded images:', mlPictures);
                }

                // Step 2: Build attributes with proper format (value_id + value_name)
                const mlAttributes = await buildMLAttributesWithIds(mlConfig.category.id, mlConfig.attributes, mlConfig.identifiers.gtin);
                console.log('Built attributes:', JSON.stringify(mlAttributes, null, 2));

                // Debug: Check specifically for WEIGHT attribute
                const weightAttr = mlAttributes.find(attr => attr.id === 'WEIGHT');
                if (weightAttr) {
                    console.log('DEBUG: WEIGHT attribute in final array:', weightAttr);
                } else {
                    console.log('DEBUG: No WEIGHT attribute found in final attributes array');
                }

                // Step 3: Create listing data following official format
                const listingData = {
                    title: product.name.es,
                    category_id: mlConfig.category.id,
                    price: parseFloat(mlConfig.pricing.price),
                    currency_id: 'COP',
                    available_quantity: parseInt(mlConfig.inventory.availableQuantity),
                    condition: 'new',
                    listing_type_id: mlConfig.pricing.listingType || 'gold_special',
                    description: {
                        plain_text: createCleanDescription(product.description.es) || 'Descripción del producto'
                    },
                    pictures: mlPictures,
                    attributes: mlAttributes,
                    // sale_terms removed (warranty section)
                };

                console.log('Final Listing Data Payload:', JSON.stringify(listingData, null, 2));

                // Step 4: Create listing on MercadoLibre
                const mlResponse = await fetch('https://api.mercadolibre.com/items', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${mlAuth.tokens.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(listingData)
                });

                const mlResult = await mlResponse.json();

                console.log(`ML Response Status: ${mlResponse.status}`);
                console.log('ML Response Data:', JSON.stringify(mlResult, null, 2));

                if (!mlResponse.ok) {
                    console.error(`\n❌ MIGRATION FAILED for product ${productId}:`);
                    console.error('Status:', mlResponse.status);
                    console.error('Error Details:', JSON.stringify(mlResult, null, 2));

                    // Extract detailed error information
                    let errorMessage = mlResult.message || 'Error desconocido';
                    let errorDetails = '';

                    if (mlResult.cause && Array.isArray(mlResult.cause)) {
                        errorDetails = mlResult.cause.map(cause => {
                            if (cause.code && cause.description) {
                                return `${cause.code}: ${cause.description}`;
                            }
                            return JSON.stringify(cause);
                        }).join('; ');
                        errorMessage += ` (${errorDetails})`;
                    } else if (mlResult.error) {
                        errorMessage += ` (${mlResult.error})`;
                    }

                    results.failed.push({
                        productId,
                        productName: product.name.es,
                        error: `Error de MercadoLibre: ${errorMessage}`,
                        mlErrorCode: mlResult.error || mlResult.status,
                        mlErrorDetails: mlResult.cause || mlResult.message,
                        requestPayload: listingData // Include the request payload for debugging
                    });
                    continue;
                }

                console.log(`✅ MIGRATION SUCCESSFUL for product ${productId}`);
                console.log('ML Item ID:', mlResult.id);
                console.log('ML Permalink:', mlResult.permalink);

                // Update product with migration info
                product.mercadoLibreConfig.migrated = true;
                product.mercadoLibreConfig.mlItemId = mlResult.id;
                product.mercadoLibreConfig.mlPermalink = mlResult.permalink;
                product.mercadoLibreConfig.migratedAt = new Date().toISOString();

                results.successful.push({
                    productId,
                    productName: product.name.es,
                    mlItemId: mlResult.id,
                    permalink: mlResult.permalink
                });

                // Add delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error migrating product ${productId}:`, error);
                results.failed.push({
                    productId,
                    error: error.message || 'Error interno del servidor'
                });
            }
        }

        // Save updated database
        saveDatabase();

        res.json({
            success: true,
            results,
            message: `Migración completada: ${results.successful.length} exitosos, ${results.failed.length} con errores`
        });

    } catch (error) {
        console.error('Error in batch migration:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor durante la migración por lotes'
        });
    }
});

// Helper function to create clean description
function createCleanDescription(htmlDescription) {
    if (!htmlDescription) return 'Producto de calidad disponible en nuestra tienda.';

    // Parse HTML table and convert to clean text
    const lines = [];

    // Try to extract table data
    const tableRegex = /<tr[^>]*>.*?<th[^>]*>(.*?)<\/th>.*?<td[^>]*>(.*?)<\/td>.*?<\/tr>/gi;
    let match;

    while ((match = tableRegex.exec(htmlDescription)) !== null) {
        const label = match[1].trim().replace(/<[^>]*>/g, '');
        const value = match[2].trim().replace(/<[^>]*>/g, '');
        if (label && value) {
            lines.push(`${label}: ${value}`);
        }
    }

    if (lines.length > 0) {
        return lines.join('\n');
    }

    // Fallback: remove HTML tags and clean up
    const cleanText = htmlDescription
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return cleanText || 'Producto de calidad disponible en nuestra tienda.';
}

// Helper function to convert relative URLs to absolute URLs
function convertToAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;

    // For local development
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}${url}`;
}

// Helper function to build sale terms array

// Helper function to upload images to MercadoLibre
async function uploadImagesToML(localImages) {
    const uploadedPictures = [];

    for (const image of localImages) {
        try {
            // Construct proper image path with security validation
            let imagePath;
            if (image.src && image.src.startsWith('/uploads/')) {
                // Remove leading slash and validate the filename
                const filename = path.basename(image.src);
                imagePath = validateSecurePath(path.join(__dirname, 'uploads'), filename);
            } else if (image.filename) {
                // Use filename with validation
                imagePath = validateSecurePath(path.join(__dirname, 'uploads'), image.filename);
            } else {
                console.error(`❌ Invalid image format:`, image);
                continue;
            }

            // Check if file exists
            if (!fs.existsSync(imagePath)) {
                console.error(`❌ Image file not found: ${imagePath}`);
                continue;
            }

            // Get file stats for detailed logging
            const fileStats = fs.statSync(imagePath);
            const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

            console.log(`📤 Uploading image: ${path.basename(imagePath)}`);
            console.log(`   📁 Path: ${imagePath}`);
            console.log(`   📏 Size: ${fileSizeMB} MB (${fileStats.size} bytes)`);
            console.log(`   ⚠️  ML Limit: 10 MB`);

            if (fileStats.size > 10 * 1024 * 1024) {
                console.error(`❌ File too large: ${fileSizeMB} MB exceeds MercadoLibre's 10 MB limit`);
                console.error(`   💡 Attempting automatic compression...`);

                try {
                    // Create compressed version with secure filename
                    const originalBasename = path.basename(imagePath, path.extname(imagePath));
                    const sanitizedBasename = sanitizeAndValidateFilename(originalBasename);
                    const compressedFilename = `${sanitizedBasename}_compressed.jpg`;
                    const compressedPath = validateSecurePath(path.dirname(imagePath), compressedFilename);

                    await sharp(imagePath)
                        .resize(1920, 1920, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({
                            quality: 85,
                            progressive: true
                        })
                        .toFile(compressedPath);

                    // Check compressed file size
                    const compressedStats = fs.statSync(compressedPath);
                    const compressedSizeMB = (compressedStats.size / (1024 * 1024)).toFixed(2);

                    console.log(`🔄 Compressed image created:`);
                    console.log(`   📏 Original: ${fileSizeMB} MB → Compressed: ${compressedSizeMB} MB`);

                    if (compressedStats.size > 10 * 1024 * 1024) {
                        console.error(`❌ Even compressed file (${compressedSizeMB} MB) exceeds 10 MB limit`);
                        fs.unlinkSync(compressedPath); // Clean up
                        continue;
                    }

                    // Use compressed file for upload
                    imagePath = compressedPath;
                    console.log(`✅ Using compressed version for upload`);

                } catch (compressionError) {
                    console.error(`❌ Failed to compress image:`, compressionError.message);
                    continue;
                }
            }

            // Create form data for image upload
            const formData = new FormData();
            formData.append('file', fs.createReadStream(imagePath));

            // Upload to MercadoLibre
            const uploadResponse = await fetch('https://api.mercadolibre.com/pictures', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${mlAuth.tokens.access_token}`,
                    ...formData.getHeaders()
                },
                body: formData
            });

            const uploadResult = await uploadResponse.json();

            if (uploadResponse.ok) {
                uploadedPictures.push({
                    id: uploadResult.id
                });
                console.log(`✅ Image uploaded successfully!`);
                console.log(`   🆔 ML Picture ID: ${uploadResult.id}`);
                console.log(`   🔗 ML URL: ${uploadResult.secure_url || uploadResult.url || 'N/A'}`);
            } else {
                console.error(`❌ Failed to upload image: ${path.basename(imagePath)}`);
                console.error(`   📊 HTTP Status: ${uploadResponse.status}`);
                console.error(`   🔍 Error Code: ${uploadResult.error || 'unknown'}`);
                console.error(`   💬 Message: ${uploadResult.message || 'No message provided'}`);
                console.error(`   📝 Full Response:`, JSON.stringify(uploadResult, null, 2));

                // Provide specific guidance based on error type
                if (uploadResult.error === 'file.invalid') {
                    if (uploadResult.message && uploadResult.message.includes('10 Mbytes')) {
                        console.error(`   💡 Solution: Resize/compress image to under 10 MB`);
                    } else if (uploadResult.message && uploadResult.message.includes('format')) {
                        console.error(`   💡 Solution: Use JPG, PNG, or GIF format`);
                    } else {
                        console.error(`   💡 Solution: Check image format and size`);
                    }
                }
            }

        } catch (error) {
            console.error(`💥 Exception uploading image ${image.src || image.filename}:`, error.message);
            console.error(`   🔍 Error Stack:`, error.stack);
        }
    }

    console.log(`\n📊 IMAGE UPLOAD SUMMARY:`);
    console.log(`   📤 Attempted: ${localImages.length} images`);
    console.log(`   ✅ Successful: ${uploadedPictures.length} images`);
    console.log(`   ❌ Failed: ${localImages.length - uploadedPictures.length} images`);

    // Cleanup compressed temporary files with secure path validation
    console.log(`🧹 Cleaning up temporary compressed files...`);
    const uploadsDir = path.join(__dirname, 'uploads');
    try {
        const files = fs.readdirSync(uploadsDir);
        const compressedFiles = files.filter(file => file.includes('_compressed.jpg'));

        for (const file of compressedFiles) {
            try {
                const filePath = validateSecurePath(uploadsDir, file);
                fs.unlinkSync(filePath);
                console.log(`   🗑️  Removed: ${file}`);
            } catch (securityError) {
                console.error(`   ⚠️  Skipped potentially unsafe file: ${file} (${securityError.message})`);
            }
        }

        if (compressedFiles.length === 0) {
            console.log(`   ✅ No temporary files to clean`);
        } else {
            console.log(`   ✅ Cleaned ${compressedFiles.length} temporary file(s)`);
        }

    } catch (cleanupError) {
        console.error(`⚠️  Error during cleanup:`, cleanupError.message);
    }

    return uploadedPictures;
}

// Helper function to build ML attributes with proper value_id mapping
async function buildMLAttributesWithIds(categoryId, configAttributes, gtin = null) {
    const attributes = [];

    try {
        // Get category attributes to find valid value IDs
        const categoryResponse = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes`, {
            headers: {
                'Authorization': `Bearer ${mlAuth.tokens.access_token}`
            }
        });

        if (!categoryResponse.ok) {
            console.error('Failed to fetch category attributes');
            return attributes;
        }

        const categoryAttributes = await categoryResponse.json();

        // Build a lookup map for attribute values
        const attributeValueMap = {};
        categoryAttributes.forEach(attr => {
            attributeValueMap[attr.id] = {
                value_type: attr.value_type,
                values: attr.values || []
            };
        });

        // Process configured attributes
        if (configAttributes) {
            Object.entries(configAttributes).forEach(([attrId, value]) => {
                if (!value || value === '') return;

                const attrInfo = attributeValueMap[attrId];
                if (!attrInfo) {
                    // Unknown attribute, add as free text
                    attributes.push({
                        id: attrId,
                        value_name: value
                    });
                    return;
                }

                // Handle different attribute types
                if (attrInfo.value_type === 'list' || attrInfo.value_type === 'boolean') {
                    // Find matching value_id for predefined values
                    const matchingValue = attrInfo.values.find(v =>
                        v.id === value || v.name === value || v.name.toLowerCase() === value.toLowerCase()
                    );

                    if (matchingValue) {
                        attributes.push({
                            id: attrId,
                            value_id: matchingValue.id,
                            value_name: matchingValue.name
                        });
                    } else {
                        // If no exact match found but it's a list, try to find closest match
                        const closestMatch = attrInfo.values.find(v =>
                            v.name.toLowerCase().includes(value.toLowerCase()) ||
                            value.toLowerCase().includes(v.name.toLowerCase())
                        );

                        if (closestMatch) {
                            attributes.push({
                                id: attrId,
                                value_id: closestMatch.id,
                                value_name: value // Keep the original value name
                            });
                        } else {
                            // For list types, we should only use predefined values
                            console.warn(`No matching value found for ${attrId}: ${value}`);
                        }
                    }
                } else {
                    // For string, number, number_unit types, use value_name only
                    let finalValue = value;

                    // Special handling for WEIGHT attribute - add 'kg' unit
                    if (attrId === 'WEIGHT' && !value.includes('kg') && !value.includes('lb')) {
                        console.log(`DEBUG: WEIGHT attribute detected - Original value: "${value}"`);
                        finalValue = `${value} kg`;
                        console.log(`DEBUG: WEIGHT attribute transformed to: "${finalValue}"`);
                    }

                    attributes.push({
                        id: attrId,
                        value_name: finalValue
                    });

                    if (attrId === 'WEIGHT') {
                        console.log(`DEBUG: Added WEIGHT attribute to array:`, { id: attrId, value_name: finalValue });
                    }
                }
            });
        }

        // Add GTIN if provided
        if (gtin && gtin !== '') {
            attributes.push({
                id: 'GTIN',
                value_name: gtin
            });
        }

    } catch (error) {
        console.error('Error building ML attributes:', error);

        // Fallback: use simple format
        if (configAttributes) {
            Object.entries(configAttributes).forEach(([attrId, value]) => {
                if (value && value !== '') {
                    let finalValue = value;

                    // Special handling for WEIGHT attribute in fallback
                    if (attrId === 'WEIGHT' && !value.includes('kg') && !value.includes('lb')) {
                        finalValue = `${value} kg`;
                    }

                    attributes.push({
                        id: attrId,
                        value_name: finalValue
                    });
                }
            });
        }

        if (gtin && gtin !== '') {
            attributes.push({
                id: 'GTIN',
                value_name: gtin
            });
        }
    }

    return attributes;
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Frontend should be accessible at http://localhost:${port}`);
    console.log(`API products endpoint: http://localhost:${port}/api/products`);
});
