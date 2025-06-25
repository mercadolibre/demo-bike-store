require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const sanitizeFilename = require('sanitize-filename');

const app = express();
const DB_PATH = path.join(__dirname, 'db.json');
const CATEGORIES_PATH = path.join(__dirname, 'categories.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Frontend should be accessible at http://localhost:${port}`);
    console.log(`API products endpoint: http://localhost:${port}/api/products`);
});
