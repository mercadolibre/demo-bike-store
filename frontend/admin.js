document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Products
    const productsGrid = document.getElementById('productsGrid');
    const productModal = document.getElementById('productModal');
    const productForm = document.getElementById('productForm');
    const addProductBtn = document.getElementById('addProductBtn');
    const modalTitle = document.getElementById('modalTitle');
    const closeBtn = document.querySelector('.close-btn');
    const cancelBtn = document.getElementById('cancelBtn');
    const addVariantBtn = document.getElementById('addVariantBtn');
    const dropZone = document.getElementById('dropZone');
    const imageInput = document.getElementById('imageInput');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const categoriesContainer = document.getElementById('categoriesContainer');

    // DOM Elements - Categories
    const categoriesList = document.getElementById('categoriesList');
    const categoryModal = document.getElementById('categoryModal');
    const categoryForm = document.getElementById('categoryForm');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const categoryModalTitle = document.getElementById('categoryModalTitle');
    const closeCategoryBtn = categoryModal.querySelector('.close-btn');
    const cancelCategoryBtn = document.getElementById('cancelCategoryBtn');
    const categoryParentSelect = document.getElementById('categoryParent');

    // DOM Elements - Tabs
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // State
    let currentProductId = null;
    let uploadedImages = [];
    let existingImages = [];
    let currentCategoryId = null;
    let categories = [];

    // Add global variable to track current category context with full breadcrumb path
    let currentCategoryContext = {
        isRoot: true,
        breadcrumbPath: [], // Array of {id, name} objects representing the full path
        categories: []
    };

    // Utility Functions for HTML Processing
    function parseHTMLTable(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const rows = doc.querySelectorAll('tr');
        const attributes = {};

        rows.forEach(row => {
            const label = row.querySelector('th');
            const value = row.querySelector('td');

            if (label && value) {
                const labelText = label.textContent.trim().toUpperCase();
                const valueText = value.textContent.trim();

                if (labelText && valueText) {
                    attributes[labelText] = valueText;
                }
            }
        });

        return attributes;
    }

    function extractCleanDescription(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        // Remove all HTML tags and get clean text
        const textContent = doc.body.textContent || doc.body.innerText || '';

        // Clean up extra whitespace
        return textContent.replace(/\s+/g, ' ').trim();
    }

    function createProductSummary(product) {
        const attributes = parseHTMLTable(product.description.es);

        // Create a clean summary from key attributes
        const keyAttributes = [
            'MARCA', 'CATEGORIA', 'MARCO / CUADRO', 'PESO KG (APROXIMADO)',
            'HORQUILLA / SUSPENSIÓN', 'FRENOS / JUEGO DE FRENOS'
        ];

        const summary = [];
        keyAttributes.forEach(key => {
            if (attributes[key]) {
                summary.push(`${key}: ${attributes[key]}`);
            }
        });

        return summary.join(' | ');
    }

    function mapProductAttributesToML(product, mlAttributes) {
        const productAttributes = parseHTMLTable(product.description.es);
        const mappedValues = {};

        // Common attribute mappings for bikes
        const attributeMapping = {
            'BRAND': ['MARCA'],
            'MODEL': ['MODELO', 'MODEL'],
            'GENDER': ['GÉNERO', 'GENDER', 'SEXO'],
            'WHEEL_SIZE': ['TAMAÑO DE RUEDA', 'WHEEL SIZE', 'LLANTAS / CORAZAS'],
            'SPEEDS_NUMBER': ['VELOCIDADES', 'SPEEDS', 'CASSETTE / PACHA'],
            'IS_FOLDABLE': ['PLEGABLE', 'FOLDABLE'],
            'INCLUDES_ASSEMBLY_MANUAL': ['MANUAL DE ENSAMBLE', 'ASSEMBLY MANUAL'],
            'FRAME_MATERIAL': ['MARCO / CUADRO', 'FRAME', 'MATERIAL DEL MARCO'],
            'BRAKE_TYPE': ['FRENOS / JUEGO DE FRENOS', 'BRAKES'],
            'SUSPENSION_TYPE': ['HORQUILLA / SUSPENSIÓN', 'SUSPENSION'],
            'WEIGHT': ['PESO KG (APROXIMADO)', 'WEIGHT', 'PESO']
        };

        mlAttributes.forEach(mlAttr => {
            const possibleKeys = attributeMapping[mlAttr.id] || [mlAttr.name.toUpperCase()];

            for (const key of possibleKeys) {
                if (productAttributes[key]) {
                    let value = productAttributes[key];

                    // Process specific attribute types
                    switch (mlAttr.id) {
                        case 'BRAND':
                            // For brand, try to use the product.brand first, then extracted value
                            const brandValue = product.brand || value;
                            // If this attribute has predefined values, try to find a match
                            if (mlAttr.values && mlAttr.values.length > 0) {
                                const matchingBrand = findBestMatch(brandValue, mlAttr.values);
                                mappedValues[mlAttr.id] = matchingBrand || brandValue;
                            } else {
                                mappedValues[mlAttr.id] = brandValue;
                            }
                            break;

                        case 'GENDER':
                            // Try to determine gender from product name or attributes
                            const productName = product.name.es.toLowerCase();
                            let genderValue = 'Unisex'; // default

                            if (productName.includes('mujer') || productName.includes('dama') ||
                                value.toLowerCase().includes('mujer') || value.toLowerCase().includes('dama')) {
                                genderValue = 'Mujer';
                            } else if (productName.includes('hombre') || productName.includes('masculin') ||
                                      value.toLowerCase().includes('hombre') || value.toLowerCase().includes('masculin')) {
                                genderValue = 'Hombre';
                            }

                            // If this attribute has predefined values, try to find a match
                            if (mlAttr.values && mlAttr.values.length > 0) {
                                const matchingGender = findBestMatch(genderValue, mlAttr.values);
                                mappedValues[mlAttr.id] = matchingGender || genderValue;
                            } else {
                                mappedValues[mlAttr.id] = genderValue;
                            }
                            break;

                        case 'WHEEL_SIZE':
                            // Extract wheel size from tire information
                            const wheelMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:x|×|\"|'')/i);
                            if (wheelMatch) {
                                const sizeValue = wheelMatch[1] + '"';
                                if (mlAttr.values && mlAttr.values.length > 0) {
                                    const matchingSize = findBestMatch(sizeValue, mlAttr.values);
                                    mappedValues[mlAttr.id] = matchingSize || sizeValue;
                                } else {
                                    mappedValues[mlAttr.id] = sizeValue;
                                }
                            }
                            break;

                        case 'SPEEDS_NUMBER':
                            // Extract number of speeds
                            const speedMatch = value.match(/(\d+)(?:\s*(?:speed|velocidad|T))/i);
                            if (speedMatch) {
                                const speedValue = speedMatch[1];
                                if (mlAttr.values && mlAttr.values.length > 0) {
                                    const matchingSpeed = findBestMatch(speedValue, mlAttr.values);
                                    mappedValues[mlAttr.id] = matchingSpeed || speedValue;
                                } else {
                                    mappedValues[mlAttr.id] = speedValue;
                                }
                            }
                            break;

                        case 'IS_FOLDABLE':
                            const foldableValue = value.toLowerCase().includes('plegable') ? 'Sí' : 'No';
                            if (mlAttr.values && mlAttr.values.length > 0) {
                                const matchingFoldable = findBestMatch(foldableValue, mlAttr.values);
                                mappedValues[mlAttr.id] = matchingFoldable || foldableValue;
                            } else {
                                mappedValues[mlAttr.id] = foldableValue;
                            }
                            break;

                        case 'INCLUDES_ASSEMBLY_MANUAL':
                            const manualValue = 'Sí'; // Assume yes for bikes
                            if (mlAttr.values && mlAttr.values.length > 0) {
                                const matchingManual = findBestMatch(manualValue, mlAttr.values);
                                mappedValues[mlAttr.id] = matchingManual || manualValue;
                            } else {
                                mappedValues[mlAttr.id] = manualValue;
                            }
                            break;

                        default:
                            // For other attributes, try to find best match if predefined values exist
                            if (mlAttr.values && mlAttr.values.length > 0) {
                                const matchingValue = findBestMatch(value, mlAttr.values);
                                mappedValues[mlAttr.id] = matchingValue || value;
                            } else {
                                mappedValues[mlAttr.id] = value;
                            }
                    }
                    break;
                }
            }
        });

        // Set brand from product.brand if available and not already set
        if (product.brand && !mappedValues['BRAND']) {
            const brandAttr = mlAttributes.find(attr => attr.id === 'BRAND');
            if (brandAttr && brandAttr.values && brandAttr.values.length > 0) {
                const matchingBrand = findBestMatch(product.brand, brandAttr.values);
                mappedValues['BRAND'] = matchingBrand || product.brand;
            } else {
                mappedValues['BRAND'] = product.brand;
            }
        }

        return mappedValues;
    }

    // Helper function to find the best match from predefined values
    function findBestMatch(searchValue, predefinedValues) {
        if (!searchValue || !predefinedValues || predefinedValues.length === 0) {
            return null;
        }

        const searchLower = searchValue.toLowerCase().trim();

        // Try exact match first
        for (const option of predefinedValues) {
            if (option.name.toLowerCase() === searchLower) {
                return option.name;
            }
        }

        // Try partial match (search value contains option or vice versa)
        for (const option of predefinedValues) {
            const optionLower = option.name.toLowerCase();
            if (searchLower.includes(optionLower) || optionLower.includes(searchLower)) {
                return option.name;
            }
        }

        // Try word-by-word match for brands
        const searchWords = searchLower.split(/\s+/);
        for (const option of predefinedValues) {
            const optionWords = option.name.toLowerCase().split(/\s+/);
            for (const searchWord of searchWords) {
                for (const optionWord of optionWords) {
                    if (searchWord === optionWord && searchWord.length > 2) {
                        return option.name;
                    }
                }
            }
        }

        return null; // No match found
    }

    // Load initial data
    loadProducts();
    loadCategories();

    // Tab Event Listeners
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            // Update buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update content
            tabContents.forEach(content => {
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // Product Event Listeners
    addProductBtn.addEventListener('click', () => openProductModal());
    closeBtn.addEventListener('click', closeProductModal);
    cancelBtn.addEventListener('click', closeProductModal);
    productForm.addEventListener('submit', handleProductFormSubmit);
    addVariantBtn.addEventListener('click', addVariantField);

    // Image upload event listeners
    dropZone.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);

    // Category Event Listeners
    addCategoryBtn.addEventListener('click', () => openCategoryModal());
    closeCategoryBtn.addEventListener('click', closeCategoryModal);
    cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    categoryForm.addEventListener('submit', handleCategoryFormSubmit);

    // Add event listener for search input
    const categorySearchInput = document.getElementById('categorySearchInput');
    if (categorySearchInput) {
        categorySearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchCategories();
            }
        });
    }

    // Functions - Categories
    async function loadCategories() {
        try {
            const response = await fetch('/api/categories');
            categories = await response.json();
            displayCategories();
            updateCategorySelects();
        } catch (error) {
            console.error('Error loading categories:', error);
            alert('Error al cargar las categorías');
        }
    }

    function displayCategories() {
        // Primero, crear un mapa de categorías por ID
        const categoryMap = new Map();
        categories.forEach(category => categoryMap.set(category.id, category));

        // Separar categorías raíz y subcategorías
        const rootCategories = categories.filter(category => !category.parent);

        // Limpiar la lista
        categoriesList.innerHTML = '';

        // Mostrar categorías raíz y sus subcategorías
        rootCategories.forEach(category => {
            const categoryElement = createCategoryElement(category);

            // Agregar subcategorías
            if (category.subcategories && category.subcategories.length > 0) {
                const subcategoriesDiv = document.createElement('div');
                subcategoriesDiv.className = 'subcategory-list';

                category.subcategories.forEach(subcategoryId => {
                    const subcategory = categoryMap.get(subcategoryId);
                    if (subcategory) {
                        const subcategoryElement = createCategoryElement(subcategory, true);
                        subcategoriesDiv.appendChild(subcategoryElement);
                    }
                });

                categoryElement.appendChild(subcategoriesDiv);
            }

            categoriesList.appendChild(categoryElement);
        });
    }

    function createCategoryElement(category, isSubcategory = false) {
        const div = document.createElement('div');
        div.className = 'category-item' + (isSubcategory ? ' subcategory' : '');

        const categoryHTML = `
            <div class="category-info">
                <h3 class="category-name">${category.name.es}</h3>
                <p class="category-description">${category.description?.es || ''}</p>
                ${category.parent ? `<p class="category-parent">Subcategoría de: ${getCategoryName(category.parent)}</p>` : ''}
            </div>
            <div class="category-actions">
                <button class="btn btn-secondary" data-action="edit-category" data-category-id="${category.id}">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-danger" data-action="delete-category" data-category-id="${category.id}">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        `;

        div.innerHTML = DOMPurify.sanitize(categoryHTML);

        // Add event listeners
        const editBtn = div.querySelector('[data-action="edit-category"]');
        const deleteBtn = div.querySelector('[data-action="delete-category"]');

        if (editBtn) {
            editBtn.addEventListener('click', () => editCategory(category.id));
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteCategory(category.id));
        }

        return div;
    }

    function getCategoryName(categoryId) {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name.es : '';
    }

    function updateCategorySelects() {
        // Actualizar select de categoría padre en el modal de categoría
        categoryParentSelect.innerHTML = DOMPurify.sanitize('<option value="">Ninguna (Categoría Principal)</option>');
        categories.forEach(category => {
            categoryParentSelect.innerHTML += DOMPurify.sanitize(`
                <option value="${category.id}">${category.name.es}</option>
            `);
        });

        // Actualizar los checkboxes de categorías en el modal de producto
        categoriesContainer.innerHTML = '';

        // Primero, crear un mapa de categorías por ID
        const categoryMap = new Map();
        categories.forEach(category => categoryMap.set(category.id, category));

        // Separar categorías raíz
        const rootCategories = categories.filter(category => !category.parent);

        // Mostrar categorías raíz y sus subcategorías
        rootCategories.forEach(rootCategory => {
            // Crear label para categoría raíz
            const rootLabel = document.createElement('label');
            rootLabel.className = 'checkbox-label root-category';
            rootLabel.innerHTML = DOMPurify.sanitize(`
                <input type="checkbox" name="category" value="${rootCategory.id}">
                <span>${rootCategory.name.es}</span>
            `);
            categoriesContainer.appendChild(rootLabel);

            // Mostrar subcategorías si existen
            if (rootCategory.subcategories && rootCategory.subcategories.length > 0) {
                const subcategoriesDiv = document.createElement('div');
                subcategoriesDiv.className = 'subcategories-checkboxes';

                rootCategory.subcategories.forEach(subcategoryId => {
                    const subcategory = categoryMap.get(subcategoryId);
                    if (subcategory) {
                        const subLabel = document.createElement('label');
                        subLabel.className = 'checkbox-label subcategory-checkbox';
                        subLabel.innerHTML = `
                            <input type="checkbox" name="category" value="${subcategory.id}">
                            <span>${subcategory.name.es}</span>
                        `;
                        subcategoriesDiv.appendChild(subLabel);
                    }
                });

                categoriesContainer.appendChild(subcategoriesDiv);
            }
        });
    }

    function openCategoryModal(category = null) {
        categoryModalTitle.textContent = category ? 'Editar Categoría' : 'Nueva Categoría';
        currentCategoryId = category ? category.id : null;

        if (category) {
            document.getElementById('categoryId').value = category.id;
            document.getElementById('categoryName').value = category.name.es;
            document.getElementById('categoryDescription').value = category.description?.es || '';
            document.getElementById('categoryParent').value = category.parent || '';
        } else {
            categoryForm.reset();
            document.getElementById('categoryId').value = '';
        }

        categoryModal.style.display = 'block';
    }

    function closeCategoryModal() {
        categoryModal.style.display = 'none';
        categoryForm.reset();
        currentCategoryId = null;
    }

    async function handleCategoryFormSubmit(e) {
        e.preventDefault();

        const formData = {
            name: {
                es: document.getElementById('categoryName').value
            },
            description: {
                es: document.getElementById('categoryDescription').value
            },
            parent: document.getElementById('categoryParent').value ? parseInt(document.getElementById('categoryParent').value) : null
        };

        if (currentCategoryId) {
            formData.id = currentCategoryId;
        }

        try {
            const url = currentCategoryId ? `/api/categories/${currentCategoryId}` : '/api/categories';
            const method = currentCategoryId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                throw new Error('Error al guardar la categoría');
            }

            closeCategoryModal();
            await loadCategories();
        } catch (error) {
            console.error('Error saving category:', error);
            alert('Error al guardar la categoría: ' + error.message);
        }
    }

    // Make category functions available globally
    window.editCategory = async function(categoryId) {
        try {
            // Obtener la categoría del array local
            const category = categories.find(c => c.id === categoryId);
            if (category) {
                openCategoryModal(category);
            } else {
                throw new Error('Categoría no encontrada');
            }
        } catch (error) {
            console.error('Error al editar la categoría:', error);
            alert('No se pudo editar la categoría: ' + error.message);
        }
    };

    window.deleteCategory = async function(categoryId) {
        if (!confirm('¿Estás seguro de que deseas eliminar esta categoría?')) {
            return;
        }

        try {
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error desconocido');
            }

            await loadCategories();
            alert('Categoría eliminada correctamente');
        } catch (error) {
            console.error('Error deleting category:', error);
            alert('Error al eliminar la categoría: ' + error.message);
        }
    };

    // Rename existing functions to be more specific
    async function openProductModal(product = null) {
        modalTitle.textContent = product ? 'Editar Producto' : 'Nuevo Producto';
        currentProductId = product ? product.id : null;

        if (product) {
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name.es || '';
            document.getElementById('productBrand').value = product.brand || '';
            document.getElementById('productDescription').value = product.description.es || '';

            // Set categories
            const categoryCheckboxes = document.querySelectorAll('input[name="category"]');
            categoryCheckboxes.forEach(checkbox => {
                const categoryId = parseInt(checkbox.value);
                const hasCategory = product.categories &&
                                   product.categories.some(cat => typeof cat === 'object' ?
                                   cat.id === categoryId : cat === categoryId);
                checkbox.checked = hasCategory;
            });

            // Load variants
            const variantsContainer = document.getElementById('variantsContainer');
            variantsContainer.innerHTML = '';
            product.variants.forEach(variant => addVariantField(variant));

            // Load images
            existingImages = product.images || [];
            displayUploadedImages();
        } else {
            productForm.reset();
            document.getElementById('productId').value = '';
            document.getElementById('variantsContainer').innerHTML = '';
            addVariantField();
            existingImages = [];
            uploadedImages = [];
            imagePreviewContainer.innerHTML = '';
        }

        productModal.style.display = 'block';
    }

    function closeProductModal() {
        productModal.style.display = 'none';
        productForm.reset();
        uploadedImages = [];
        existingImages = [];
        imagePreviewContainer.innerHTML = '';
    }

    // Functions
    async function loadProducts() {
        try {
            const response = await fetch('/api/products');
            const products = await response.json();
            displayProducts(products);
        } catch (error) {
            console.error('Error loading products:', error);
            alert('Error al cargar los productos');
        }
    }

    function displayProducts(products) {
        const productsHTML = products.map(product => `
            <div class="product-card">
                <div class="product-image">
                    <img src="${product.images && product.images.length > 0 ? product.images[0].src : '/assets/placeholder.jpg'}"
                         alt="${product.name.es}">
                </div>
                <div class="product-info">
                    <h3>${product.name.es}</h3>
                    ${product.brand ? `<p class="product-brand">${product.brand}</p>` : ''}
                    <p class="product-price">$${product.variants[0].price}</p>
                    <div class="product-actions">
                        <button class="btn btn-secondary" data-action="edit-product" data-product-id="${product.id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-danger" data-action="delete-product" data-product-id="${product.id}">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        productsGrid.innerHTML = DOMPurify.sanitize(productsHTML);

        // Add event listeners after DOM insertion
        productsGrid.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.target.closest('button').dataset.productId);
                const action = e.target.closest('button').dataset.action;

                switch (action) {
                    case 'edit-product':
                        editProduct(productId);
                        break;
                    case 'delete-product':
                        deleteProduct(productId);
                        break;
                }
            });
        });
    }

    async function handleProductFormSubmit(e) {
        e.preventDefault();

        // Get selected categories
        const selectedCategories = Array.from(
            document.querySelectorAll('input[name="category"]:checked')
        ).map(cb => {
            const categoryId = parseInt(cb.value);
            // Find the category name to include it in the object, matching db.json format
            const categoryName = getCategoryName(categoryId);
            return {
                id: categoryId,
                name: {
                    es: categoryName
                },
                handle: {
                    es: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                },
                parent: null, // This will be set by the server if needed
                subcategories: [] // This will be set by the server if needed
            };
        });

        const formData = {
            name: {
                es: document.getElementById('productName').value
            },
            description: {
                es: document.getElementById('productDescription').value
            },
            brand: document.getElementById('productBrand').value || null,
            categories: selectedCategories,
            variants: getVariantsData(),
            images: [...existingImages, ...uploadedImages]
        };

        if (currentProductId) {
            formData.id = currentProductId;
        }

        try {
            const url = currentProductId ? `/api/products/${currentProductId}` : '/api/products';
            const method = currentProductId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error desconocido');
            }

            closeProductModal();
            await loadProducts();
            alert(currentProductId ? 'Producto actualizado correctamente' : 'Producto creado correctamente');
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Error al guardar el producto: ' + error.message);
        }
    }

    function getVariantsData() {
        const variantElements = document.querySelectorAll('.variant-item');
        return Array.from(variantElements).map(variant => ({
            name: variant.querySelector('.variant-name').value,
            price: parseFloat(variant.querySelector('.variant-price').value),
            stock: variant.querySelector('.variant-stock').value ?
                parseInt(variant.querySelector('.variant-stock').value) : null
        }));
    }

    function addVariantField(variant = null) {
        const variantsContainer = document.getElementById('variantsContainer');
        const variantDiv = document.createElement('div');
        variantDiv.className = 'variant-item';
        variantDiv.innerHTML = DOMPurify.sanitize(`
            <input type="text" placeholder="Nombre de la variante" class="variant-name"
                value="${variant ? variant.name : ''}" required>
            <input type="number" placeholder="Precio" class="variant-price"
                value="${variant ? variant.price : ''}" required min="0" step="0.01">
            <input type="number" placeholder="Stock (vacío = infinito)" class="variant-stock"
                value="${variant && variant.stock !== null ? variant.stock : ''}" min="0">
            <button type="button" class="remove-variant-btn">
                <i class="fas fa-trash"></i>
            </button>
        `);

        variantDiv.querySelector('.remove-variant-btn').addEventListener('click', () => {
            if (document.querySelectorAll('.variant-item').length > 1) {
                variantDiv.remove();
            }
        });

        variantsContainer.appendChild(variantDiv);
    }

    // File upload handlers
    function handleFileSelect(e) {
        handleFiles(e.target.files);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    async function handleFiles(files) {
        const remainingSlots = 5 - (uploadedImages.length + existingImages.length);
        if (remainingSlots <= 0) {
            alert('Ya has alcanzado el límite máximo de 5 imágenes');
            return;
        }

        const filesToUpload = Array.from(files).slice(0, remainingSlots);

        try {
            const formData = new FormData();
            filesToUpload.forEach(file => {
                formData.append('images', file);
            });

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al subir las imágenes');
            }

            const newImages = await response.json();
            uploadedImages.push(...newImages);
            displayUploadedImages();
        } catch (error) {
            console.error('Error uploading files:', error);
            alert('Error al subir las imágenes: ' + error.message);
        }
    }

    function displayUploadedImages() {
        const allImages = [...existingImages, ...uploadedImages];
        const imagesHTML = allImages.map((image, index) => `
            <div class="image-preview-item">
                <img src="${image.src}" alt="Preview">
                <div class="image-preview-actions">
                    <button type="button" data-action="remove-image" data-image-index="${index}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        imagePreviewContainer.innerHTML = DOMPurify.sanitize(imagesHTML);

        // Add event listeners for remove buttons
        imagePreviewContainer.querySelectorAll('[data-action="remove-image"]').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('button').dataset.imageIndex);
                removeImage(index);
            });
        });
    }

    function displayExistingImages() {
        displayUploadedImages();
    }

    // Make these functions available globally
    window.editProduct = async function(productId) {
        try {
            const response = await fetch(`/api/products/${productId}`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error desconocido');
            }
            const product = await response.json();
            openProductModal(product);
        } catch (error) {
            console.error('Error al editar el producto:', error);
            alert('No se pudo editar el producto: ' + error.message);
        }
    };

    window.deleteProduct = async function(productId) {
        if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) {
            return;
        }

        try {
            const response = await fetch(`/api/products/${productId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error desconocido');
            }

            await loadProducts();
            alert('Producto eliminado correctamente');
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Error al eliminar el producto: ' + error.message);
        }
    };

    // Define the global removeImage function
    window.removeImage = function(index) {
        const allImages = [...existingImages, ...uploadedImages];
        const imageToRemove = allImages[index];

        if (index < existingImages.length) {
            existingImages.splice(index, 1);
        } else {
            uploadedImages.splice(index - existingImages.length, 1);
        }

        displayUploadedImages();
    };

    // MercadoLibre Integration Functions
    let mlAuthStatus = null;
    let mlProducts = [];
    let selectedProduct = null;
    let selectedCategory = null;
    let categoryAttributes = [];
    let selectedProductIds = new Set(); // Track selected products for batch migration

    async function initMercadoLibre() {
        await checkMLAuthStatus();
        if (mlAuthStatus && mlAuthStatus.authenticated) {
            await loadMLProducts();
        }
    }

    async function checkMLAuthStatus() {
        try {
            const response = await fetch('/api/ml/auth/status');
            mlAuthStatus = await response.json();
            updateMLAuthUI();
        } catch (error) {
            console.error('Error checking ML auth status:', error);
            updateMLAuthUI({ authenticated: false, error: error.message });
        }
    }

    function updateMLAuthUI() {
        const authStatusDiv = document.getElementById('mlAuthStatus');
        const productsSection = document.getElementById('mlProductsSection');
        const statusSection = document.getElementById('mlStatusSection');

        if (!mlAuthStatus) {
            authStatusDiv.innerHTML = DOMPurify.sanitize('<div class="loading">Verificando estado de autenticación...</div>');
            return;
        }

        if (mlAuthStatus.authenticated) {
            authStatusDiv.className = 'ml-auth-status authenticated';
            const authHTML = `
                <div class="ml-auth-info">
                    <div class="ml-user-info">
                        <h4>✅ Conectado a MercadoLibre</h4>
                        <p><strong>Usuario:</strong> ${mlAuthStatus.user?.nickname || mlAuthStatus.user_id || 'N/A'}</p>
                        <p><strong>Sitio:</strong> ${mlAuthStatus.user?.site_id || 'MCO'}</p>
                        <p><strong>Token expira en:</strong> ${Math.floor((mlAuthStatus.expires_in || 0) / 3600)} horas</p>
                    </div>
                    <div class="ml-auth-actions">
                        <button class="btn-ml" data-action="refresh-token">
                            <i class="fas fa-sync"></i> Renovar Token
                        </button>
                        <button class="btn-ml" data-action="logout">
                            <i class="fas fa-sign-out-alt"></i> Desconectar
                        </button>
                    </div>
                </div>
            `;
            authStatusDiv.innerHTML = DOMPurify.sanitize(authHTML);

            // Add event listeners for auth buttons
            const refreshButton = authStatusDiv.querySelector('[data-action="refresh-token"]');
            const logoutButton = authStatusDiv.querySelector('[data-action="logout"]');

            if (refreshButton) {
                refreshButton.addEventListener('click', refreshMLToken);
            }
            if (logoutButton) {
                logoutButton.addEventListener('click', logoutML);
            }

            productsSection.style.display = 'block';
            statusSection.style.display = 'block';
        } else {
            authStatusDiv.className = 'ml-auth-status not-authenticated';
            const authHTML = `
                <div class="ml-auth-info">
                    <div class="ml-user-info">
                        <h4>❌ No conectado a MercadoLibre</h4>
                        <p>Necesitas autenticarte para migrar productos</p>
                        ${mlAuthStatus.error ? `<p style="color: #dc3545;">Error: ${mlAuthStatus.error}</p>` : ''}
                    </div>
                    <div class="ml-auth-actions">
                        <button class="btn-ml" data-action="authenticate">
                            <i class="fas fa-sign-in-alt"></i> Conectar con MercadoLibre
                        </button>
                    </div>
                </div>
            `;
            authStatusDiv.innerHTML = DOMPurify.sanitize(authHTML);

            // Add event listener for auth button
            const authButton = authStatusDiv.querySelector('[data-action="authenticate"]');
            if (authButton) {
                authButton.addEventListener('click', authenticateML);
            }

            productsSection.style.display = 'none';
            statusSection.style.display = 'none';
        }
    }

    async function authenticateML() {
        try {
            const response = await fetch('/api/ml/auth/url');
            const data = await response.json();

            if (data.authUrl) {
                window.open(data.authUrl, '_blank', 'width=600,height=700');

                // Check for authentication completion
                const checkAuth = setInterval(async () => {
                    await checkMLAuthStatus();
                    if (mlAuthStatus && mlAuthStatus.authenticated) {
                        clearInterval(checkAuth);
                        await loadMLProducts();
                        alert('¡Autenticación exitosa!');
                    }
                }, 2000);

                // Stop checking after 5 minutes
                setTimeout(() => clearInterval(checkAuth), 300000);
            }
        } catch (error) {
            console.error('Error starting authentication:', error);
            alert('Error al iniciar autenticación: ' + error.message);
        }
    }

    async function refreshMLToken() {
        try {
            const response = await fetch('/api/ml/auth/refresh', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                await checkMLAuthStatus();
                alert('Token renovado exitosamente');
            } else {
                throw new Error(data.error || 'Error al renovar token');
            }
        } catch (error) {
            console.error('Error refreshing token:', error);
            alert('Error al renovar token: ' + error.message);
        }
    }

    async function logoutML() {
        if (!confirm('¿Estás seguro de que deseas desconectar de MercadoLibre?')) {
            return;
        }

        try {
            const response = await fetch('/api/ml/auth/logout', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                mlAuthStatus = { authenticated: false };
                updateMLAuthUI();
                const mlProductsGrid = document.getElementById('mlProductsGrid');
                if (mlProductsGrid) {
                    mlProductsGrid.innerHTML = '';
                }
                alert('Desconectado exitosamente');
            }
        } catch (error) {
            console.error('Error logging out:', error);
            alert('Error al desconectar: ' + error.message);
        }
    }

    async function loadMLProducts() {
        try {
            const response = await fetch('/api/products');
            mlProducts = await response.json();
            displayMLProducts();
        } catch (error) {
            console.error('Error loading products for migration:', error);
            const mlProductsGrid = document.getElementById('mlProductsGrid');
            if (mlProductsGrid) {
                mlProductsGrid.innerHTML = DOMPurify.sanitize('<p style="color: #dc3545;">Error al cargar productos</p>');
            }
        }
    }

    function displayMLProducts() {
        const mlProductsGrid = document.getElementById('mlProductsGrid');
        const batchControls = document.getElementById('batchMigrationControls');

        if (!mlProductsGrid) return;

        if (mlProducts.length === 0) {
            mlProductsGrid.innerHTML = DOMPurify.sanitize('<p>No hay productos para migrar.</p>');
            if (batchControls) batchControls.style.display = 'none';
            return;
        }

        // Check if there are any configured products that can be migrated
        const configurableProducts = mlProducts.filter(product => {
            const mlConfig = product.mercadoLibreConfig || null;
            const status = mlConfig ? (mlConfig.migrated ? 'migrated' : 'configured') : 'not-configured';
            return status === 'configured';
        });

        // Show/hide batch controls based on configurable products
        if (batchControls) {
            batchControls.style.display = configurableProducts.length > 0 ? 'flex' : 'none';
        }

        // Create HTML without onclick handlers to avoid DOMPurify removing them
        const productsHTML = mlProducts.map(product => {
            const firstVariant = product.variants[0];
            const imageUrl = product.images && product.images.length > 0
                ? product.images[0].src
                : '/placeholder-image.jpg';

            // Create clean product summary
            const productSummary = createProductSummary(product);

            // Check if product has ML configuration (this is now stored in the database)
            const mlConfig = product.mercadoLibreConfig || null;
            const status = mlConfig && mlConfig.configured ?
                (mlConfig.migrated ? 'migrated' : 'configured') : 'not-configured';

            let statusHTML = '';
            let actionsHTML = '';
            let checkboxHTML = '';

            // Add checkbox for configured products that can be migrated
            if (status === 'configured') {
                const isSelected = selectedProductIds.has(product.id);
                checkboxHTML = `
                    <div class="ml-product-selection">
                        <input type="checkbox"
                               id="product-${product.id}"
                               ${isSelected ? 'checked' : ''}
                               data-product-id="${product.id}">
                    </div>
                `;
            }

            switch (status) {
                case 'not-configured':
                    statusHTML = `
                        <div class="ml-product-card-status not-configured">
                            <i class="fas fa-exclamation-triangle"></i>
                            Sin configurar
                        </div>
                    `;
                    actionsHTML = `
                        <button class="btn-configure" data-action="configure" data-product-id="${product.id}">
                            <i class="fas fa-cog"></i> Configurar
                        </button>
                    `;
                    break;
                case 'configured':
                    statusHTML = `
                        <div class="ml-product-card-status configured">
                            <i class="fas fa-check-circle"></i>
                            Configurado
                        </div>
                    `;
                    actionsHTML = `
                        <button class="btn-configure" data-action="configure" data-product-id="${product.id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn-success" data-action="migrate" data-product-id="${product.id}">
                            <i class="fas fa-upload"></i> Migrar
                        </button>
                    `;
                    break;
                case 'migrated':
                    statusHTML = `
                        <div class="ml-product-card-status migrated">
                            <i class="fas fa-check"></i>
                            Migrado
                        </div>
                    `;
                    actionsHTML = `
                        <button class="btn btn-secondary" data-action="view" data-product-id="${product.id}">
                            <i class="fas fa-external-link-alt"></i> Ver en ML
                        </button>
                    `;
                    break;
            }

            const cardClass = selectedProductIds.has(product.id) ? 'ml-product-card selected' : 'ml-product-card';

            return `
                <div class="${cardClass}" data-product-id="${product.id}">
                    ${checkboxHTML}
                    <div class="ml-product-card-header">
                        <img src="${imageUrl}" alt="${product.name.es}" class="ml-product-card-image">
                        <div class="ml-product-card-info">
                            <h4>${product.name.es}</h4>
                            <p class="product-summary">${productSummary}</p>
                            <div class="ml-product-card-price">$${firstVariant.price}</div>
                        </div>
                    </div>
                    ${statusHTML}
                    <div class="ml-product-card-actions">
                        ${actionsHTML}
                    </div>
                </div>
            `;
        }).join('');

        // Use DOMPurify to sanitize the HTML
        mlProductsGrid.innerHTML = DOMPurify.sanitize(productsHTML);

        // Add event listeners after DOM insertion
        // Checkbox event listeners
        mlProductsGrid.querySelectorAll('input[type="checkbox"][data-product-id]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const productId = parseInt(e.target.dataset.productId);
                toggleProductSelection(productId);
            });
        });

        // Button event listeners
        mlProductsGrid.querySelectorAll('button[data-action]').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.target.closest('button').dataset.productId);
                const action = e.target.closest('button').dataset.action;

                switch (action) {
                    case 'configure':
                        openCategorySelectionModal(productId);
                        break;
                    case 'migrate':
                        migrateProduct(productId);
                        break;
                    case 'view':
                        viewMLListing(productId);
                        break;
                }
            });
        });

        // Update batch controls
        updateBatchControls();
    }

    // Category Selection Modal Functions
    function openCategorySelectionModal(productId) {
        selectedProduct = mlProducts.find(p => p.id === productId);
        if (!selectedProduct) return;

        const modal = document.getElementById('categorySelectionModal');
        const modalTitle = document.getElementById('categoryModalTitle');

        // Update modal title based on whether product is already configured
        const isConfigured = selectedProduct.mercadoLibreConfig && selectedProduct.mercadoLibreConfig.configured;
        modalTitle.textContent = isConfigured
            ? `Editar configuración de "${selectedProduct.name.es}"`
            : `Configurar "${selectedProduct.name.es}" para MercadoLibre`;

        // Populate product info
        populateProductInfo();

        // Reset modal state
        resetModalState();

        // If product is already configured, load existing configuration
        if (isConfigured) {
            loadExistingConfiguration();
        } else {
            // Start category prediction for new configuration
            predictCategoriesForProduct();
        }

        // Load root categories immediately in the manual exploration section
        loadRootCategories();

        // Show modal
        modal.style.display = 'block';

        // Add event listeners
        setupModalEventListeners();
    }

    async function loadExistingConfiguration() {
        try {
            // Load configuration from server
            const response = await fetch(`/api/products/${selectedProduct.id}/ml-config`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al cargar la configuración');
            }

            const mlConfig = result.config;

            if (!mlConfig || !mlConfig.configured) {
                // No configuration found, treat as new
                predictCategoriesForProduct();
                return;
            }

            // Set the selected category
            selectedCategory = {
                id: mlConfig.category.id,
                name: mlConfig.category.name,
                path: mlConfig.category.path
            };

            // Update UI to show selected category
            updateSelectedCategoryUI();

            // Load category attributes
            await loadCategoryAttributes(mlConfig.category.id);

            // Pre-fill attribute values from saved configuration
            if (mlConfig.attributes) {
                setTimeout(() => {
                    Object.entries(mlConfig.attributes).forEach(([attrId, value]) => {
                        const input = document.querySelector(`[data-attribute-id="${attrId}"]`);
                        if (input) {
                            input.value = value;
                            input.style.backgroundColor = '#e8f5e8';
                            input.title = '✓ Configuración guardada previamente';
                        }
                    });
                }, 100);
            }

            // Pre-fill other configuration sections
            if (mlConfig.pricing) {
                const priceInput = document.getElementById('productPrice');
                const listingTypeSelect = document.getElementById('listingType');

                if (priceInput && mlConfig.pricing.price) {
                    priceInput.value = mlConfig.pricing.price;
                    priceInput.style.backgroundColor = '#e8f5e8';
                    priceInput.title = '✓ Configuración guardada previamente';
                }

                if (listingTypeSelect && mlConfig.pricing.listingType) {
                    listingTypeSelect.value = mlConfig.pricing.listingType;
                    listingTypeSelect.style.backgroundColor = '#e8f5e8';
                    listingTypeSelect.title = '✓ Configuración guardada previamente';
                }
            }

            if (mlConfig.inventory) {
                const quantityInput = document.getElementById('availableQuantity');
                const skuInput = document.getElementById('sellerSku');

                if (quantityInput && mlConfig.inventory.availableQuantity) {
                    quantityInput.value = mlConfig.inventory.availableQuantity;
                    quantityInput.style.backgroundColor = '#e8f5e8';
                    quantityInput.title = '✓ Configuración guardada previamente';
                }

                if (skuInput && mlConfig.inventory.sellerSku) {
                    skuInput.value = mlConfig.inventory.sellerSku;
                    skuInput.style.backgroundColor = '#e8f5e8';
                    skuInput.title = '✓ Configuración guardada previamente';
                }
            }

            // Pre-fill identifiers section (GTIN, etc.)
            if (mlConfig.identifiers) {
                const gtinInput = document.getElementById('productGtin');

                if (gtinInput && mlConfig.identifiers.gtin) {
                    gtinInput.value = mlConfig.identifiers.gtin;
                    gtinInput.style.backgroundColor = '#e8f5e8';
                    gtinInput.title = '✓ Configuración guardada previamente';
                }
            }

            // Enable save button
            document.getElementById('saveMigrationConfigBtn').disabled = false;

        } catch (error) {
            console.error('Error loading existing configuration:', error);
            // If there's an error loading, treat as new configuration
            predictCategoriesForProduct();
        }
    }

    function populateProductInfo() {
        const imageUrl = selectedProduct.images && selectedProduct.images.length > 0
            ? selectedProduct.images[0].src
            : '/placeholder-image.jpg';

        // Create clean product summary
        const productSummary = createProductSummary(selectedProduct);

        document.getElementById('modalProductImage').src = imageUrl;
        document.getElementById('modalProductName').textContent = selectedProduct.name.es;
        document.getElementById('modalProductDescription').textContent = productSummary;
        document.getElementById('modalProductPrice').textContent = `$${selectedProduct.variants[0].price}`;
    }

    function resetModalState() {
        selectedCategory = null;
        categoryAttributes = [];

        // Hide sections
        document.getElementById('selectedCategorySection').style.display = 'none';
        document.getElementById('attributesSection').style.display = 'none';
        document.getElementById('pricingSection').style.display = 'none';
        document.getElementById('inventorySection').style.display = 'none';
        document.getElementById('identifiersSection').style.display = 'none';

        // Show manual exploration section by default
        const manualCategorySection = document.querySelector('.manual-category-section');
        if (manualCategorySection) {
            manualCategorySection.style.display = 'block';
        }

        // Reset buttons
        document.getElementById('saveMigrationConfigBtn').disabled = true;

        // Clear category browser
        document.getElementById('categoryBrowser').innerHTML = '';
        document.getElementById('categorySearchInput').value = '';

        // Clear all form fields
        clearAllFormFields();
    }

    function setupModalEventListeners() {
        // Close modal
        const modal = document.getElementById('categorySelectionModal');
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = document.getElementById('cancelMigrationBtn');

        closeBtn.onclick = () => modal.style.display = 'none';
        cancelBtn.onclick = () => modal.style.display = 'none';

        // Category search
        const searchBtn = document.getElementById('categorySearchBtn');
        const searchInput = document.getElementById('categorySearchInput');

        searchBtn.onclick = searchCategories;
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') searchCategories();
        };

        // Save configuration
        document.getElementById('saveMigrationConfigBtn').onclick = saveMigrationConfig;
    }

    async function predictCategoriesForProduct() {
        const suggestedCategoriesDiv = document.getElementById('suggestedCategories');
        const loadingDiv = document.getElementById('categoryPredictionLoading');
        const predictionsListDiv = document.getElementById('categoryPredictionsList');

        suggestedCategoriesDiv.style.display = 'block';
        loadingDiv.style.display = 'block';
        predictionsListDiv.innerHTML = '';

        try {
            // Use only the product title for better category prediction
            const response = await fetch('/api/ml/categories/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: selectedProduct.name.es,
                    // Don't send description as it's HTML table that confuses the AI
                    description: ''
                })
            });

            const result = await response.json();
            displayCategoryPredictionsInModal(result);

        } catch (error) {
            console.error('Error predicting categories:', error);
            predictionsListDiv.innerHTML = DOMPurify.sanitize('<p>Error al obtener sugerencias de categorías.</p>');
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    function displayCategoryPredictionsInModal(result) {
        const predictionsListDiv = document.getElementById('categoryPredictionsList');
        const manualCategorySection = document.querySelector('.manual-category-section');

        if (!result.predictions || result.predictions.length === 0) {
            predictionsListDiv.innerHTML = DOMPurify.sanitize(`
                <p>No se encontraron categorías sugeridas. Usa el explorador manual para seleccionar una categoría.</p>
            `);
            // Show manual exploration prominently when no suggestions
            if (manualCategorySection) {
                manualCategorySection.style.display = 'block';
            }
            return;
        }

        // Hide manual exploration section when we have suggestions
        if (manualCategorySection) {
            manualCategorySection.style.display = 'none';
        }

        const predictionsHTML = result.predictions.map(prediction => {
            const confidenceClass = getConfidenceClass(prediction.confidence);

            return `
                <div class="prediction-suggestion" data-action="select-prediction" data-category-id="${prediction.category_id}" data-category-name="${prediction.category_name}" data-category-path="${prediction.path_from_root || ''}">
                    <div class="prediction-suggestion-header">
                        <h6 class="prediction-suggestion-title">${prediction.category_name}</h6>
                        <span class="prediction-confidence-badge ${confidenceClass}">
                            ${Math.round(prediction.confidence)}%
                        </span>
                    </div>
                    <p class="prediction-suggestion-path">${prediction.path_from_root || prediction.domain || ''}</p>
                </div>
            `;
        }).join('') + `
            <div class="manual-exploration-toggle">
                <button type="button" class="btn-toggle-manual" data-action="toggle-manual">
                    <i class="fas fa-search"></i>
                    ¿No encuentras la categoría correcta? Explorar manualmente
                </button>
            </div>
        `;

        predictionsListDiv.innerHTML = DOMPurify.sanitize(predictionsHTML);

        // Add event listeners after DOM insertion
        predictionsListDiv.querySelectorAll('[data-action="select-prediction"]').forEach(element => {
            element.addEventListener('click', (e) => {
                const categoryId = e.currentTarget.dataset.categoryId;
                const categoryName = e.currentTarget.dataset.categoryName;
                const categoryPath = e.currentTarget.dataset.categoryPath;
                selectCategoryFromPrediction(categoryId, categoryName, categoryPath);
            });
        });

        const toggleManualBtn = predictionsListDiv.querySelector('[data-action="toggle-manual"]');
        if (toggleManualBtn) {
            toggleManualBtn.addEventListener('click', toggleManualExploration);
        }
    }

    function getConfidenceClass(confidence) {
        if (confidence >= 80) return 'high';
        if (confidence >= 60) return 'medium';
        return 'low';
    }

    async function selectCategoryFromPrediction(categoryId, categoryName, categoryPath) {
        selectedCategory = {
            id: categoryId,
            name: categoryName,
            path: categoryPath
        };

        // Update UI
        updateSelectedCategoryUI();

        // Load attributes
        await loadCategoryAttributes(categoryId);

        // Enable save button
        document.getElementById('saveMigrationConfigBtn').disabled = false;
    }

    function updateSelectedCategoryUI() {
        const selectedCategorySection = document.getElementById('selectedCategorySection');
        const selectedCategoryInfo = document.getElementById('selectedCategoryInfo');

        selectedCategoryInfo.innerHTML = DOMPurify.sanitize(`
            <h6 class="selected-category-name">${selectedCategory.name}</h6>
            <p class="selected-category-path">${selectedCategory.path}</p>
            <p class="selected-category-id">ID: ${selectedCategory.id}</p>
        `);

        selectedCategorySection.style.display = 'block';

        // Highlight selected prediction
        document.querySelectorAll('.prediction-suggestion').forEach(el => {
            el.classList.remove('selected');
        });

        // Find and highlight the selected one using data attribute
        const selectedElement = document.querySelector(`[data-category-id="${selectedCategory.id}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }

    async function loadCategoryAttributes(categoryId) {
        try {
            const response = await fetch(`/api/ml/categories/${categoryId}/attributes`);
            const result = await response.json();

            if (result.success && result.attributes) {
                // Store the complete attributes structure with required/optional separation
                categoryAttributes = {
                    all: result.attributes.all || [],
                    required: result.attributes.required || [],
                    optional: result.attributes.optional || [],
                    total: result.attributes.total || 0,
                    required_count: result.attributes.required_count || 0
                };
            } else if (Array.isArray(result)) {
                // Fallback for direct array response - treat all as optional
                categoryAttributes = {
                    all: result,
                    required: [],
                    optional: result,
                    total: result.length,
                    required_count: 0
                };
            } else {
                categoryAttributes = {
                    all: [],
                    required: [],
                    optional: [],
                    total: 0,
                    required_count: 0
                };
            }

            // Debug: Log the attributes structure to understand what we received
            console.log('Category attributes loaded:');
            console.log('- Total attributes:', categoryAttributes.total);
            console.log('- Required attributes:', categoryAttributes.required_count);
            console.log('- Optional attributes:', categoryAttributes.optional.length);
            console.log('- Required attribute IDs:', categoryAttributes.required.map(attr => attr.id));

            displayAttributesForm();

        } catch (error) {
            console.error('Error loading category attributes:', error);
            document.getElementById('attributesForm').innerHTML =
                DOMPurify.sanitize('<p class="text-danger">Error al cargar los atributos de la categoría.</p>');
        }
    }

    // Enhanced prefilling functions for different product structures
    function prefillPricingSection(product) {
        // Get the first variant (all products have at least one variant)
        const variant = product.variants && product.variants[0];
        if (!variant) return;

        // Prefill price
        const priceInput = document.getElementById('productPrice');
        if (priceInput && variant.price) {
            priceInput.value = Math.round(parseFloat(variant.price));
            priceInput.style.backgroundColor = '#e8f5e8';
            priceInput.title = '✓ Auto-completado desde variante del producto';
        }

        // Prefill compare at price
        const compareAtPriceInput = document.getElementById('compareAtPrice');
        if (compareAtPriceInput && variant.compare_at_price) {
            compareAtPriceInput.value = Math.round(parseFloat(variant.compare_at_price));
            compareAtPriceInput.style.backgroundColor = '#e8f5e8';
            compareAtPriceInput.title = '✓ Auto-completado desde variante del producto';
        }

        // Prefill promotional price if available
        const promotionalPriceInput = document.getElementById('promotionalPrice');
        if (promotionalPriceInput && variant.promotional_price) {
            promotionalPriceInput.value = Math.round(parseFloat(variant.promotional_price));
            promotionalPriceInput.style.backgroundColor = '#e8f5e8';
            promotionalPriceInput.title = '✓ Auto-completado desde variante del producto';
        }

        // Prefill listing type based on product characteristics
        const listingTypeSelect = document.getElementById('listingType');
        if (listingTypeSelect) {
            // Default to gold_special for bikes, bronze for accessories
            const isBike = product.name.es.toLowerCase().includes('bicicleta');
            listingTypeSelect.value = isBike ? 'gold_special' : 'bronze';
            listingTypeSelect.style.backgroundColor = '#e8f5e8';
            listingTypeSelect.title = '✓ Auto-completado basado en tipo de producto';
        }

        // Prefill buying mode
        const buyingModeSelect = document.getElementById('buyingMode');
        if (buyingModeSelect) {
            buyingModeSelect.value = 'buy_it_now';
            buyingModeSelect.style.backgroundColor = '#e8f5e8';
            buyingModeSelect.title = '✓ Auto-completado (compra inmediata)';
        }

        // Prefill condition
        const conditionSelect = document.getElementById('condition');
        if (conditionSelect) {
            conditionSelect.value = 'new';
            conditionSelect.style.backgroundColor = '#e8f5e8';
            conditionSelect.title = '✓ Auto-completado (nuevo)';
        }
    }

    function prefillInventorySection(product) {
        const variant = product.variants && product.variants[0];
        if (!variant) return;

        // Prefill available quantity based on stock management
        const availableQuantityInput = document.getElementById('availableQuantity');
        if (availableQuantityInput) {
            if (variant.stock_management && variant.stock !== null) {
                availableQuantityInput.value = variant.stock;
                availableQuantityInput.style.backgroundColor = '#e8f5e8';
                availableQuantityInput.title = '✓ Auto-completado desde stock del producto';
            } else {
                // Default to 1 for products without stock management
                availableQuantityInput.value = 1;
                availableQuantityInput.style.backgroundColor = '#fff3cd';
                availableQuantityInput.title = '⚠ Valor por defecto (producto sin gestión de stock)';
            }
        }

        // Prefill sold quantity (default to 0)
        const soldQuantityInput = document.getElementById('soldQuantity');
        if (soldQuantityInput) {
            soldQuantityInput.value = 0;
            soldQuantityInput.style.backgroundColor = '#e8f5e8';
            soldQuantityInput.title = '✓ Auto-completado (producto nuevo)';
        }
    }

    function prefillIdentifiersSection(product) {
        const variant = product.variants && product.variants[0];
        if (!variant) return;

        // Prefill SKU if available
        const skuInput = document.getElementById('sellerSku');
        if (skuInput && variant.sku) {
            skuInput.value = variant.sku;
            skuInput.style.backgroundColor = '#e8f5e8';
            skuInput.title = '✓ Auto-completado desde SKU del producto';
        }

        // Prefill barcode if available
        const barcodeInput = document.getElementById('barcode');
        if (barcodeInput && variant.barcode) {
            barcodeInput.value = variant.barcode;
            barcodeInput.style.backgroundColor = '#e8f5e8';
            barcodeInput.title = '✓ Auto-completado desde código de barras del producto';
        }

        // Prefill MPN if available
        const mpnInput = document.getElementById('manufacturerPartNumber');
        if (mpnInput && variant.mpn) {
            mpnInput.value = variant.mpn;
            mpnInput.style.backgroundColor = '#e8f5e8';
            mpnInput.title = '✓ Auto-completado desde MPN del producto';
        }
    }


    // Enhanced displayAttributesForm function
    function displayAttributesForm() {
        const attributesSection = document.getElementById('attributesSection');
        const attributesForm = document.getElementById('attributesForm');

        // Show all configuration sections in the correct order
        document.getElementById('pricingSection').style.display = 'block';
        document.getElementById('inventorySection').style.display = 'block';
        document.getElementById('attributesSection').style.display = 'block';
        document.getElementById('identifiersSection').style.display = 'block';

        // Prefill all sections with product data
        if (selectedProduct) {
            prefillPricingSection(selectedProduct);
            prefillInventorySection(selectedProduct);
            prefillIdentifiersSection(selectedProduct);
        }

        // Ensure categoryAttributesContainer is visible
        const categoryAttributesContainer = document.getElementById('categoryAttributesContainer');
        if (categoryAttributesContainer) {
            categoryAttributesContainer.style.display = 'block';
        }

        if (!selectedCategory || !categoryAttributes) {
            attributesForm.innerHTML = DOMPurify.sanitize('<p class="text-muted">Selecciona una categoría para ver los atributos disponibles.</p>');
            return;
        }

        // Use MercadoLibre's pre-sorted required/optional arrays instead of manual filtering
        const requiredAttributes = categoryAttributes.required || [];
        const optionalAttributes = categoryAttributes.optional || [];

        console.log('Required attributes from ML API:', requiredAttributes.length);
        console.log('Optional attributes from ML API:', optionalAttributes.length);
        console.log('Required attribute names:', requiredAttributes.map(attr => attr.name));

        let formHTML = '';

        // Required attributes section
        if (requiredAttributes.length > 0) {
            formHTML += `
                <div class="attributes-group required-group">
                    <div class="attributes-section-header">
                        <h5 class="attributes-section-title required-section">
                            <i class="fas fa-exclamation-circle"></i>
                            Atributos Requeridos (${requiredAttributes.length})
                        </h5>
                        <p class="attributes-section-description">Estos atributos son obligatorios para publicar en MercadoLibre</p>
                    </div>
                    <div class="attributes-container">
            `;

            requiredAttributes.forEach(attribute => {
                formHTML += generateAttributeField(attribute, true);
            });

            formHTML += `
                    </div>
                </div>
            `;
        }

        // Optional attributes section
        if (optionalAttributes.length > 0) {
            formHTML += `
                <div class="attributes-group optional-group">
                    <div class="attributes-section-header">
                        <h5 class="attributes-section-title optional-section">
                            <i class="fas fa-info-circle"></i>
                            Atributos Opcionales (${optionalAttributes.length})
                        </h5>
                        <p class="attributes-section-description">Estos atributos ayudan a mejorar la visibilidad del producto</p>
                    </div>
                    <div class="attributes-container">
            `;

            optionalAttributes.forEach(attribute => {
                formHTML += generateAttributeField(attribute, false);
            });

            formHTML += `
                    </div>
                </div>
            `;
        }

        attributesForm.innerHTML = DOMPurify.sanitize(formHTML);

        // Apply auto-filled values and styling
        if (selectedProduct) {
            // Generate product attribute mapping using all attributes for mapping
            const allAttributes = [...requiredAttributes, ...optionalAttributes];
            const productAttributeMapping = mapProductAttributesToML(selectedProduct, allAttributes);
            applyAttributeMapping(productAttributeMapping);
        }
    }

    async function searchCategories() {
        const searchTerm = document.getElementById('categorySearchInput').value.trim();
        const categoryBrowser = document.getElementById('categoryBrowser');

        if (!searchTerm) {
            // Load appropriate categories based on current context
            if (currentCategoryContext.isRoot) {
                await loadRootCategories();
            } else {
                await loadSubcategories(currentCategoryContext.parentId, currentCategoryContext.parentName);
            }
            return;
        }

        // Show loading state
        categoryBrowser.innerHTML = DOMPurify.sanitize('<div style="padding: 15px; text-align: center;"><i class="fas fa-search fa-spin"></i> Buscando categorías...</div>');

        // Small delay to show loading state
        await new Promise(resolve => setTimeout(resolve, 200));

        // Search through current context categories
        const matchingCategories = currentCategoryContext.categories.filter(category =>
            category.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // Display filtered results
        if (matchingCategories.length === 0) {
            const contextText = currentCategoryContext.isRoot ? 'categorías principales' : `subcategorías de "${currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1]?.name}"`;

            categoryBrowser.innerHTML = DOMPurify.sanitize(`
                <div class="category-navigation">
                    <div class="category-breadcrumb-nav">
                        <span class="breadcrumb-item" data-action="load-root-categories">Categorías Principales</span>
                        ${currentCategoryContext.breadcrumbPath.map((breadcrumb, index) => `
                            <i class="fas fa-chevron-right breadcrumb-separator"></i>
                            <span class="breadcrumb-item" data-action="navigate-breadcrumb" data-breadcrumb-index="${index}">${breadcrumb.name}</span>
                        `).join('')}
                        <i class="fas fa-chevron-right breadcrumb-separator"></i>
                        <span class="breadcrumb-item active">Búsqueda: "${searchTerm}"</span>
                    </div>
                    <div style="padding: 20px; text-align: center;">
                        <i class="fas fa-search" style="font-size: 2rem; color: #ccc; margin-bottom: 10px;"></i>
                        <p style="color: #666; margin: 0;">No se encontraron categorías que coincidan con tu búsqueda en ${contextText}.</p>
                        <p style="color: #999; font-size: 0.9rem; margin: 5px 0 0 0;">Intenta con otros términos de búsqueda o navega manualmente por las categorías.</p>
                    </div>
                </div>
            `);
            return;
        }

        const contextText = currentCategoryContext.isRoot ? 'en categorías principales' : `en "${currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1]?.name}"`;

        categoryBrowser.innerHTML = DOMPurify.sanitize(`
            <div class="category-navigation">
                <div class="category-breadcrumb-nav">
                    <span class="breadcrumb-item" onclick="loadRootCategories()">Categorías Principales</span>
                    ${currentCategoryContext.breadcrumbPath.map((breadcrumb, index) => `
                        <i class="fas fa-chevron-right breadcrumb-separator"></i>
                        <span class="breadcrumb-item" onclick="navigateToBreadcrumb(${index})">${breadcrumb.name}</span>
                    `).join('')}
                    <i class="fas fa-chevron-right breadcrumb-separator"></i>
                    <span class="breadcrumb-item active">Búsqueda: "${searchTerm}" (${matchingCategories.length} resultado${matchingCategories.length !== 1 ? 's' : ''} ${contextText})</span>
                </div>
                ${!currentCategoryContext.isRoot ? `
                    <div class="category-actions">
                        <button class="btn-select-parent" data-action="select-parent-category" data-parent-id="${currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1]?.id}" data-parent-name="${currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1]?.name}" data-parent-path="${currentCategoryContext.breadcrumbPath.map(b => b.name).join(' > ')}"
                            <i class="fas fa-check"></i> Seleccionar "${currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1]?.name}"
                        </button>
                    </div>
                ` : ''}
                <div class="category-list">
                    ${matchingCategories.map(category => {
                        const categoryPath = currentCategoryContext.isRoot
                            ? category.name
                            : `${currentCategoryContext.breadcrumbPath.map(b => b.name).join(' > ')} > ${category.name}`;

                        if (currentCategoryContext.isRoot) {
                            // Root category - always has children
                            return `
                                <div class="category-tree-item has-children" data-action="load-subcategories" data-category-id="${category.id}" data-category-name="${category.name}">
                                    <div class="category-item-content">
                                        <span class="category-name">${category.name}</span>
                                        <i class="fas fa-chevron-right category-arrow"></i>
                                    </div>
                                </div>
                            `;
                        } else {
                            // Subcategory
                            const currentParent = currentCategoryContext.breadcrumbPath[currentCategoryContext.breadcrumbPath.length - 1];
                            return `
                                <div class="category-tree-item" data-action="handle-subcategory" data-subcategory-id="${category.id}" data-subcategory-name="${category.name}" data-parent-name="${currentParent?.name}">
                                    <div class="category-item-content">
                                        <span class="category-name">${category.name}</span>
                                        <span class="category-item-count">(${category.total_items_in_this_category} productos)</span>
                                        <button class="btn-select-category" data-action="select-subcategory" data-subcategory-id="${category.id}" data-subcategory-name="${category.name}" data-subcategory-path="${currentCategoryContext.breadcrumbPath.map(b => b.name).join(' > ')} > ${category.name}">Seleccionar</button>
                                    </div>
                                </div>
                            `;
                        }
                    }).join('')}
                </div>
            </div>
        `);

        // Add event listeners for search results
        setupCategorySearchEventListeners(categoryBrowser);
    }

    function setupCategorySearchEventListeners(categoryBrowser) {
        // Root categories navigation
        const rootBreadcrumb = categoryBrowser.querySelector('[data-action="load-root-categories"]');
        if (rootBreadcrumb) {
            rootBreadcrumb.addEventListener('click', loadRootCategories);
        }

        // Breadcrumb navigation
        const breadcrumbItems = categoryBrowser.querySelectorAll('[data-action="navigate-breadcrumb"]');
        breadcrumbItems.forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.breadcrumbIndex);
                navigateToBreadcrumb(index);
            });
        });

        // Parent category selection
        const parentBtn = categoryBrowser.querySelector('[data-action="select-parent-category"]');
        if (parentBtn) {
            parentBtn.addEventListener('click', () => {
                const categoryId = parentBtn.dataset.parentId;
                const categoryName = parentBtn.dataset.parentName;
                const categoryPath = parentBtn.dataset.parentPath;
                selectCategoryFromTree(categoryId, categoryName, categoryPath);
            });
        }

        // Category navigation (root categories)
        const rootCategories = categoryBrowser.querySelectorAll('[data-action="load-subcategories"]');
        rootCategories.forEach(item => {
            item.addEventListener('click', () => {
                const categoryId = item.dataset.categoryId;
                const categoryName = item.dataset.categoryName;
                loadSubcategories(categoryId, categoryName);
            });
        });

        // Subcategory navigation
        const subcategories = categoryBrowser.querySelectorAll('[data-action="handle-subcategory"]');
        subcategories.forEach(item => {
            item.addEventListener('click', () => {
                const categoryId = item.dataset.subcategoryId;
                const categoryName = item.dataset.subcategoryName;
                const parentName = item.dataset.parentName;
                handleSubcategoryClick(categoryId, categoryName, parentName);
            });
        });

        // Subcategory selection buttons
        const selectBtns = categoryBrowser.querySelectorAll('[data-action="select-subcategory"]');
        selectBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.subcategoryId;
                const categoryName = btn.dataset.subcategoryName;
                const categoryPath = btn.dataset.subcategoryPath;
                selectCategoryFromTree(categoryId, categoryName, categoryPath);
            });
        });
    }

    async function loadRootCategories() {
        const categoryBrowser = document.getElementById('categoryBrowser');

        // Clear search input when loading root categories
        const searchInput = document.getElementById('categorySearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        try {
            categoryBrowser.innerHTML = DOMPurify.sanitize('<div style="padding: 15px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Cargando categorías...</div>');

            const response = await fetch('/api/ml/categories');
            const categories = await response.json();

            if (!categories || categories.length === 0) {
                categoryBrowser.innerHTML = DOMPurify.sanitize('<p style="padding: 15px; color: #666;">No se pudieron cargar las categorías.</p>');
                return;
            }

            // Update category context
            currentCategoryContext = {
                isRoot: true,
                breadcrumbPath: [], // Array of {id, name} objects representing the full path
                categories: categories
            };

            const categoryHTML = `
                <div class="category-navigation">
                    <div class="category-breadcrumb-nav">
                        <span class="breadcrumb-item active">Categorías Principales</span>
                    </div>
                    <div class="category-list">
                        ${categories.map(category => `
                            <div class="category-tree-item has-children" data-action="load-subcategories" data-category-id="${category.id}" data-category-name="${category.name}">
                                <div class="category-item-content">
                                    <span class="category-name">${category.name}</span>
                                    <i class="fas fa-chevron-right category-arrow"></i>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            categoryBrowser.innerHTML = DOMPurify.sanitize(categoryHTML);

            // Add event listeners
            categoryBrowser.querySelectorAll('[data-action="load-subcategories"]').forEach(element => {
                element.addEventListener('click', (e) => {
                    const categoryId = e.currentTarget.dataset.categoryId;
                    const categoryName = e.currentTarget.dataset.categoryName;
                    loadSubcategories(categoryId, categoryName);
                });
            });

        } catch (error) {
            console.error('Error loading root categories:', error);
            categoryBrowser.innerHTML = DOMPurify.sanitize('<p style="padding: 15px; color: #dc3545;">Error al cargar categorías.</p>');
        }
    }

    // Make loadRootCategories globally available immediately
    window.loadRootCategories = loadRootCategories;

    // Handle category navigation
    window.handleCategoryClick = async function(categoryId, categoryName, hasChildren) {
        if (!hasChildren) {
            // If no children, select this category
            selectCategoryFromTree(categoryId, categoryName, categoryName);
            return;
        }

        // Load subcategories
        await loadSubcategories(categoryId, categoryName);
    };

    async function loadSubcategories(parentCategoryId, parentCategoryName, customBreadcrumbPath = null) {
        const categoryBrowser = document.getElementById('categoryBrowser');

        // Clear search input when navigating categories
        const searchInput = document.getElementById('categorySearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        try {
            categoryBrowser.innerHTML = DOMPurify.sanitize('<div style="padding: 15px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Cargando subcategorías...</div>');

            const response = await fetch(`/api/ml/categories/${parentCategoryId}`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Error al cargar categoría');
            }

            const categoryData = result.category;

            if (!categoryData.children_categories || categoryData.children_categories.length === 0) {
                // No subcategories, allow selection of parent
                selectCategoryFromTree(parentCategoryId, parentCategoryName, parentCategoryName);
                return;
            }

            // The children_categories already contains the basic info (id, name, total_items)
            // We don't need to fetch each one individually for the initial display
            const subcategories = categoryData.children_categories;

            // Update category context
            currentCategoryContext = {
                isRoot: false,
                breadcrumbPath: customBreadcrumbPath || [...currentCategoryContext.breadcrumbPath, {id: parentCategoryId, name: parentCategoryName}],
                categories: subcategories
            };

            const categoryHTML = `
                <div class="category-navigation">
                    <div class="category-breadcrumb-nav">
                        <span class="breadcrumb-item" data-action="load-root-categories">Categorías Principales</span>
                        ${currentCategoryContext.breadcrumbPath.map((breadcrumb, index) => {
                            const isLast = index === currentCategoryContext.breadcrumbPath.length - 1;
                            if (isLast) {
                                return `
                                    <i class="fas fa-chevron-right breadcrumb-separator"></i>
                                    <span class="breadcrumb-item active">${breadcrumb.name}</span>
                                `;
                            } else {
                                return `
                                    <i class="fas fa-chevron-right breadcrumb-separator"></i>
                                    <span class="breadcrumb-item" data-action="navigate-breadcrumb" data-breadcrumb-index="${index}">${breadcrumb.name}</span>
                                `;
                            }
                        }).join('')}
                    </div>
                    <div class="category-actions">
                        <button class="btn-select-parent" data-action="select-parent-category" data-parent-id="${parentCategoryId}" data-parent-name="${parentCategoryName}" data-parent-path="${currentCategoryContext.breadcrumbPath.map(b => b.name).join(' > ')}">
                            <i class="fas fa-check"></i> Seleccionar "${parentCategoryName}"
                        </button>
                    </div>
                    <div class="category-list">
                        ${subcategories.map(subcategory => `
                            <div class="category-tree-item" data-action="handle-subcategory" data-subcategory-id="${subcategory.id}" data-subcategory-name="${subcategory.name}" data-parent-name="${parentCategoryName}">
                                <div class="category-item-content">
                                    <span class="category-name">${subcategory.name}</span>
                                    <span class="category-item-count">(${subcategory.total_items_in_this_category} productos)</span>
                                    <button class="btn-select-category" data-action="select-subcategory" data-subcategory-id="${subcategory.id}" data-subcategory-name="${subcategory.name}" data-subcategory-path="${currentCategoryContext.breadcrumbPath.map(b => b.name).join(' > ')} > ${subcategory.name}">Seleccionar</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            categoryBrowser.innerHTML = DOMPurify.sanitize(categoryHTML);

            // Add event listeners
            // Root categories breadcrumb
            const rootBreadcrumb = categoryBrowser.querySelector('[data-action="load-root-categories"]');
            if (rootBreadcrumb) {
                rootBreadcrumb.addEventListener('click', loadRootCategories);
            }

            // Breadcrumb navigation
            categoryBrowser.querySelectorAll('[data-action="navigate-breadcrumb"]').forEach(breadcrumb => {
                breadcrumb.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.dataset.breadcrumbIndex);
                    navigateToBreadcrumb(index);
                });
            });

            // Parent category selection
            const parentBtn = categoryBrowser.querySelector('[data-action="select-parent-category"]');
            if (parentBtn) {
                parentBtn.addEventListener('click', (e) => {
                    const parentId = e.currentTarget.dataset.parentId;
                    const parentName = e.currentTarget.dataset.parentName;
                    const parentPath = e.currentTarget.dataset.parentPath;
                    selectCategoryFromTree(parentId, parentName, parentPath);
                });
            }

            // Subcategory items (click to expand)
            categoryBrowser.querySelectorAll('[data-action="handle-subcategory"]').forEach(subcategoryItem => {
                subcategoryItem.addEventListener('click', (e) => {
                    // Don't handle if the click was on the select button
                    if (e.target.closest('[data-action="select-subcategory"]')) {
                        return;
                    }

                    const subcategoryId = e.currentTarget.dataset.subcategoryId;
                    const subcategoryName = e.currentTarget.dataset.subcategoryName;
                    const parentName = e.currentTarget.dataset.parentName;
                    handleSubcategoryClick(subcategoryId, subcategoryName, parentName);
                });
            });

            // Subcategory selection buttons
            categoryBrowser.querySelectorAll('[data-action="select-subcategory"]').forEach(selectBtn => {
                selectBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent triggering the parent click
                    const subcategoryId = e.currentTarget.dataset.subcategoryId;
                    const subcategoryName = e.currentTarget.dataset.subcategoryName;
                    const subcategoryPath = e.currentTarget.dataset.subcategoryPath;
                    selectCategoryFromTree(subcategoryId, subcategoryName, subcategoryPath);
                });
            });

        } catch (error) {
            console.error('Error loading subcategories:', error);
            categoryBrowser.innerHTML = DOMPurify.sanitize('<p style="padding: 15px; color: #dc3545;">Error al cargar subcategorías.</p>');
        }
    }

    // Make loadSubcategories globally available immediately
    window.loadSubcategories = loadSubcategories;

    // Handle subcategory click - check if it has children before deciding action
    window.handleSubcategoryClick = async function(categoryId, categoryName, parentCategoryName) {
        try {
            // First check if this category has children
            const response = await fetch(`/api/ml/categories/${categoryId}`);
            const result = await response.json();

            if (result.success && result.category.children_categories && result.category.children_categories.length > 0) {
                // Has children, load them (this will update the context automatically)
                await loadSubcategories(categoryId, categoryName);
            } else {
                // No children, select this category
                selectCategoryFromTree(categoryId, categoryName, `${parentCategoryName} > ${categoryName}`);
            }
        } catch (error) {
            console.error('Error checking subcategory:', error);
            // If there's an error, just select the category
            selectCategoryFromTree(categoryId, categoryName, `${parentCategoryName} > ${categoryName}`);
        }
    };

    async function selectCategoryFromTree(categoryId, categoryName, categoryPath) {
        selectedCategory = {
            id: categoryId,
            name: categoryName,
            path: categoryPath
        };

        // Update UI
        updateSelectedCategoryUI();

        // Load attributes
        await loadCategoryAttributes(categoryId);

        // Enable save button
        document.getElementById('saveMigrationConfigBtn').disabled = false;
    }

    async function saveMigrationConfig() {
        if (!selectedProduct || !selectedCategory || !categoryAttributes) {
            alert('Error: Faltan datos necesarios para guardar la configuración.');
            return;
        }

        // Validate required attributes using the pre-sorted required array
        const requiredAttributes = categoryAttributes.required || [];
        const missingRequired = [];

        // Collect attribute values and check required ones
        const attributeValues = {};
        const allAttributes = [...(categoryAttributes.required || []), ...(categoryAttributes.optional || [])];

        allAttributes.forEach(attr => {
            const input = document.querySelector(`[data-attribute-id="${attr.id}"]`);
            if (input && input.value.trim()) {
                attributeValues[attr.id] = input.value.trim();
            } else if (requiredAttributes.find(reqAttr => reqAttr.id === attr.id)) {
                missingRequired.push(attr.name);
            }
        });

        // Check if there are missing required attributes
        if (missingRequired.length > 0) {
            alert(`Los siguientes atributos requeridos están vacíos:\n\n${missingRequired.join('\n')}\n\nPor favor, completa todos los campos requeridos antes de guardar.`);
            highlightMissingRequiredFields(missingRequired);
            return;
        }

        // Validate GTIN is provided (now required)
        const gtinValue = document.getElementById('productGtin')?.value?.trim();
        if (!gtinValue) {
            alert('El código de barras (GTIN) es obligatorio para migrar productos a MercadoLibre.\n\nPor favor, ingresa un código de barras válido.');
            document.getElementById('productGtin')?.focus();
            return;
        }

        // Basic GTIN format validation (8, 12, 13, or 14 digits)
        const gtinPattern = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;
        if (!gtinPattern.test(gtinValue)) {
            alert('El código de barras (GTIN) debe tener 8, 12, 13 o 14 dígitos.\n\nFormato actual: ' + gtinValue.length + ' caracteres\nPor favor, verifica el código.');
            document.getElementById('productGtin')?.focus();
            return;
        }

        // Collect values from other configuration sections
        const pricingData = {
            price: document.getElementById('productPrice')?.value,
            listingType: document.getElementById('listingType')?.value || 'gold_special'
        };

        const inventoryData = {
            availableQuantity: parseInt(document.getElementById('availableQuantity')?.value) || 1,
            sellerSku: document.getElementById('sellerSku')?.value || ''
        };

        const identifiersData = {
            gtin: document.getElementById('productGtin')?.value || ''
        };

        // Create complete migration configuration
        const migrationConfig = {
            productId: selectedProduct.id,
            category: {
                id: selectedCategory.id,
                name: selectedCategory.name,
                path: selectedCategory.path
            },
            attributes: attributeValues,
            pricing: pricingData,
            inventory: inventoryData,
            identifiers: identifiersData,
            configured: true,
            migrated: false,
            configuredAt: new Date().toISOString()
        };

        // Show saving state
        const saveBtn = document.getElementById('saveMigrationConfigBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = DOMPurify.sanitize('<i class="fas fa-spinner fa-spin"></i> Guardando...');
        saveBtn.disabled = true;

        try {
            // Save configuration to server
            const response = await fetch(`/api/products/${selectedProduct.id}/ml-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(migrationConfig)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al guardar la configuración');
            }

            // Update local product data
            selectedProduct.mercadoLibreConfig = migrationConfig;

            // Update product in the products array
            const productIndex = mlProducts.findIndex(p => p.id === selectedProduct.id);
            if (productIndex !== -1) {
                mlProducts[productIndex].mercadoLibreConfig = migrationConfig;
            }

            // Update product status in the UI
            const productCard = document.querySelector(`[data-product-id="${selectedProduct.id}"]`);
            if (productCard) {
                productCard.classList.remove('not-configured');
                productCard.classList.add('configured');

                const statusDiv = productCard.querySelector('.ml-product-card-status');
                if (statusDiv) {
                    statusDiv.className = 'ml-product-card-status configured';
                    statusDiv.innerHTML = DOMPurify.sanitize('<i class="fas fa-check-circle"></i> Configurado');
                }

                // Update actions
                const actionsDiv = productCard.querySelector('.ml-product-card-actions');
                if (actionsDiv) {
                    const actionsHTML = `
                        <button class="btn-configure" data-action="configure" data-product-id="${selectedProduct.id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn-success" data-action="migrate" data-product-id="${selectedProduct.id}">
                            <i class="fas fa-upload"></i> Migrar
                        </button>
                    `;
                    actionsDiv.innerHTML = DOMPurify.sanitize(actionsHTML);

                    // Add event listeners for the new buttons
                    const configureBtn = actionsDiv.querySelector('[data-action="configure"]');
                    const migrateBtn = actionsDiv.querySelector('[data-action="migrate"]');

                    if (configureBtn) {
                        configureBtn.addEventListener('click', () => openCategorySelectionModal(selectedProduct.id));
                    }
                    if (migrateBtn) {
                        migrateBtn.addEventListener('click', () => migrateProduct(selectedProduct.id));
                    }
                }

                // Add selection checkbox since product is now configured
                const existingCheckbox = productCard.querySelector('.ml-product-selection');
                if (!existingCheckbox) {
                    const checkboxHTML = `
                        <div class="ml-product-selection">
                            <input type="checkbox"
                                   id="product-${selectedProduct.id}"
                                   data-product-id="${selectedProduct.id}">
                        </div>
                    `;
                    productCard.insertAdjacentHTML('afterbegin', DOMPurify.sanitize(checkboxHTML));

                    // Add event listener for the new checkbox
                    const newCheckbox = productCard.querySelector('.ml-product-selection input[type="checkbox"]');
                    if (newCheckbox) {
                        newCheckbox.addEventListener('change', (e) => {
                            const productId = parseInt(e.target.dataset.productId);
                            toggleProductSelection(productId);
                        });
                    }
                }
            }

            // Update batch controls
            updateBatchControls();

            // Refresh the entire ML products display to ensure UI is updated
            displayMLProducts();

            // Close modal and show success message
            document.getElementById('categorySelectionModal').style.display = 'none';

            // Show success notification
            const notification = document.createElement('div');
            notification.className = 'notification success';
            notification.innerHTML = DOMPurify.sanitize(`
                <i class="fas fa-check-circle"></i>
                Configuración guardada exitosamente para "${selectedProduct.name.es}"
            `);
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.remove();
            }, 3000);

            console.log('Migration configuration saved to server:', result);

        } catch (error) {
            console.error('Error saving migration configuration:', error);
            alert('Error al guardar la configuración: ' + error.message);
        } finally {
            // Restore button
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    function highlightMissingRequiredFields(missingAttributeNames) {
        // Remove previous highlights
        document.querySelectorAll('.attribute-group.missing-required').forEach(group => {
            group.classList.remove('missing-required');
        });

        // Highlight missing required fields
        missingAttributeNames.forEach(attrName => {
            const attributeGroup = Array.from(document.querySelectorAll('.attribute-group.required')).find(group => {
                const nameSpan = group.querySelector('.attribute-name');
                return nameSpan && nameSpan.textContent === attrName;
            });

            if (attributeGroup) {
                attributeGroup.classList.add('missing-required');

                // Scroll to first missing field
                if (missingAttributeNames.indexOf(attrName) === 0) {
                    attributeGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });

        // Remove highlights after 5 seconds
        setTimeout(() => {
            document.querySelectorAll('.attribute-group.missing-required').forEach(group => {
                group.classList.remove('missing-required');
            });
        }, 5000);
    }

    async function migrateProduct(productId) {
        const product = mlProducts.find(p => p.id === productId);
        if (!product) {
            alert('Producto no encontrado');
            return;
        }

        const confirmMessage = `¿Estás seguro de que deseas migrar "${product.name.es}" a MercadoLibre?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        // Find the migrate button and show loading state
        const migrateBtn = document.querySelector(`button[data-action="migrate"][data-product-id="${productId}"]`);
        let originalText = '';
        if (migrateBtn) {
            originalText = migrateBtn.innerHTML;
            migrateBtn.innerHTML = DOMPurify.sanitize('<i class="fas fa-spinner fa-spin"></i> Migrando...');
            migrateBtn.disabled = true;
        }

        try {
            const response = await fetch(`/api/ml/products/${productId}/migrate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error durante la migración');
            }

            // Update local product data
            const productIndex = mlProducts.findIndex(p => p.id === productId);
            if (productIndex !== -1) {
                mlProducts[productIndex].mercadoLibreConfig.migrated = true;
                mlProducts[productIndex].mercadoLibreConfig.mlItemId = result.mlItemId;
                mlProducts[productIndex].mercadoLibreConfig.mlPermalink = result.permalink;
                mlProducts[productIndex].mercadoLibreConfig.migratedAt = new Date().toISOString();
            }

            // Update the product card in the UI
            const productCard = document.querySelector(`[data-product-id="${productId}"]`);
            if (productCard) {
                const statusDiv = productCard.querySelector('.ml-product-card-status');
                if (statusDiv) {
                    statusDiv.className = 'ml-product-card-status migrated';
                    statusDiv.innerHTML = DOMPurify.sanitize('<i class="fas fa-check"></i> Migrado');
                }

                const actionsDiv = productCard.querySelector('.ml-product-card-actions');
                if (actionsDiv) {
                    const actionsHTML = `
                        <button class="btn btn-secondary" data-action="view" data-ml-item-id="${result.mlItemId}" data-ml-permalink="${result.permalink}">
                            <i class="fas fa-external-link-alt"></i> Ver en ML
                        </button>
                    `;
                    actionsDiv.innerHTML = DOMPurify.sanitize(actionsHTML);

                    // Add event listener for the view button
                    const viewBtn = actionsDiv.querySelector('[data-action="view"]');
                    if (viewBtn) {
                        viewBtn.addEventListener('click', (e) => {
                            const mlItemId = e.target.closest('button').dataset.mlItemId;
                            const permalink = e.target.closest('button').dataset.mlPermalink;
                            viewMLListing(mlItemId, permalink);
                        });
                    }
                }

                // Remove selection checkbox since product is now migrated
                const checkbox = productCard.querySelector('.ml-product-selection');
                if (checkbox) {
                    checkbox.remove();
                }
            }

            // Update batch controls
            updateBatchControls();

            // Refresh the entire ML products display to ensure UI is updated
            displayMLProducts();

            alert(`Producto "${product.name.es}" migrado exitosamente a MercadoLibre!`);

        } catch (error) {
            console.error('Error migrating product:', error);
            alert('Error al migrar el producto: ' + error.message);
        } finally {
            // Restore button
            if (migrateBtn) {
                migrateBtn.innerHTML = originalText;
                migrateBtn.disabled = false;
            }
        }
    }

    function viewMLListing(mlItemId, permalink) {
        if (permalink) {
            window.open(permalink, '_blank');
        } else if (mlItemId) {
            // Construct URL based on site (Colombia in this case)
            const mlUrl = `https://articulo.mercadolibre.com.co/${mlItemId}`;
            window.open(mlUrl, '_blank');
        } else {
            alert('No se encontró el enlace al listado de MercadoLibre');
        }
    }

    // Check for ML auth success/error in URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ml_success')) {
        setTimeout(() => {
            alert('¡Autenticación con MercadoLibre exitosa!');
            checkMLAuthStatus();
        }, 1000);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('ml_error')) {
        setTimeout(() => {
            alert('Error en autenticación: ' + decodeURIComponent(urlParams.get('ml_error')));
        }, 1000);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Initialize ML when MercadoLibre tab is first opened
    const mlTab = document.querySelector('[data-tab="mercadolibre"]');
    let mlInitialized = false;
    mlTab.addEventListener('click', () => {
        if (!mlInitialized) {
            mlInitialized = true;
            initMercadoLibre();
            setupBatchMigrationEventListeners();
        }
    });

    // Batch Migration Functions
    function setupBatchMigrationEventListeners() {
        const selectAllBtn = document.getElementById('selectAllBtn');
        const deselectAllBtn = document.getElementById('deselectAllBtn');
        const batchMigrateBtn = document.getElementById('batchMigrateBtn');

        if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllConfiguredProducts);
        if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAllProducts);
        if (batchMigrateBtn) batchMigrateBtn.addEventListener('click', batchMigrateProducts);
    }

    function toggleProductSelection(productId) {
        if (selectedProductIds.has(productId)) {
            selectedProductIds.delete(productId);
        } else {
            selectedProductIds.add(productId);
        }

        // Update the visual state of the product card
        const productCard = document.querySelector(`[data-product-id="${productId}"]`);
        if (productCard) {
            if (selectedProductIds.has(productId)) {
                productCard.classList.add('selected');
            } else {
                productCard.classList.remove('selected');
            }
        }

        updateBatchControls();
    }

    function updateBatchControls() {
        const selectedCountSpan = document.getElementById('selectedCount');
        const batchMigrateBtn = document.getElementById('batchMigrateBtn');

        const selectedCount = selectedProductIds.size;

        if (selectedCountSpan) {
            selectedCountSpan.textContent = selectedCount;
        }

        if (batchMigrateBtn) {
            batchMigrateBtn.disabled = selectedCount === 0;
        }
    }

    function selectAllConfiguredProducts() {
        // Find all configured products that can be migrated
        const configurableProducts = mlProducts.filter(product => {
            const mlConfig = product.mercadoLibreConfig || null;
            const status = mlConfig ? (mlConfig.migrated ? 'migrated' : 'configured') : 'not-configured';
            return status === 'configured';
        });

        // Add all configurable products to selection
        configurableProducts.forEach(product => {
            selectedProductIds.add(product.id);
        });

        // Refresh the display to show updated selection
        displayMLProducts();
    }

    function deselectAllProducts() {
        selectedProductIds.clear();
        displayMLProducts();
    }

    async function batchMigrateProducts() {
        if (selectedProductIds.size === 0) {
            alert('No hay productos seleccionados para migrar.');
            return;
        }

        const selectedProducts = Array.from(selectedProductIds);
        const confirmMessage = `¿Estás seguro de que deseas migrar ${selectedProducts.length} producto${selectedProducts.length > 1 ? 's' : ''} a MercadoLibre?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        // Show progress
        const batchMigrateBtn = document.getElementById('batchMigrateBtn');
        const originalText = batchMigrateBtn.innerHTML;
        batchMigrateBtn.innerHTML = DOMPurify.sanitize('<i class="fas fa-spinner fa-spin"></i> Migrando...');
        batchMigrateBtn.disabled = true;

        try {
            const response = await fetch('/api/ml/products/batch-migrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productIds: selectedProducts
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error durante la migración por lotes');
            }

            // Update local product data for successful migrations
            result.results.successful.forEach(successItem => {
                const productIndex = mlProducts.findIndex(p => p.id === parseInt(successItem.productId));
                if (productIndex !== -1) {
                    mlProducts[productIndex].mercadoLibreConfig.migrated = true;
                    mlProducts[productIndex].mercadoLibreConfig.mlItemId = successItem.mlItemId;
                    mlProducts[productIndex].mercadoLibreConfig.mlPermalink = successItem.permalink;
                    mlProducts[productIndex].mercadoLibreConfig.migratedAt = new Date().toISOString();
                }
            });

            // Clear selection
            selectedProductIds.clear();

            // Refresh display
            displayMLProducts();

            // Show detailed results
            let message = result.message + '\n\n';

            if (result.results.successful.length > 0) {
                message += '✅ Productos migrados exitosamente:\n';
                result.results.successful.forEach(item => {
                    message += `• ${item.productName} (ID: ${item.mlItemId})\n`;
                });
                message += '\n';
            }

            if (result.results.failed.length > 0) {
                message += '❌ Productos con errores:\n';
                result.results.failed.forEach(item => {
                    message += `• ${item.productName || `Producto ${item.productId}`}: ${item.error}\n`;
                });
            }

            alert(message);

        } catch (error) {
            console.error('Error in batch migration:', error);
            alert('Error durante la migración por lotes: ' + error.message);
        } finally {
            // Restore button
            batchMigrateBtn.innerHTML = originalText;
            batchMigrateBtn.disabled = false;
        }
    }

    async function migrateProductToML(productId) {
        const response = await fetch(`/api/ml/products/${productId}/migrate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Error durante la migración');
        }

        return result;
    }

    // Make functions globally available
    window.openCategorySelectionModal = openCategorySelectionModal;
    window.selectCategoryFromPrediction = selectCategoryFromPrediction;
    window.selectCategoryFromTree = selectCategoryFromTree;
    window.handleSubcategoryClick = handleSubcategoryClick;
    window.migrateProduct = migrateProduct;
    window.viewMLListing = viewMLListing;
    window.authenticateML = authenticateML;
    window.refreshMLToken = refreshMLToken;
    window.logoutML = logoutML;
    window.toggleProductSelection = toggleProductSelection;

    // Function to navigate to a specific breadcrumb level
    async function navigateToBreadcrumb(breadcrumbIndex) {
        if (breadcrumbIndex < 0 || breadcrumbIndex >= currentCategoryContext.breadcrumbPath.length) {
            return;
        }

        const targetBreadcrumb = currentCategoryContext.breadcrumbPath[breadcrumbIndex];

        // Create the breadcrumb path up to the selected level
        const newBreadcrumbPath = currentCategoryContext.breadcrumbPath.slice(0, breadcrumbIndex + 1);

        // Load the subcategories for the selected breadcrumb level with the correct path
        await loadSubcategories(targetBreadcrumb.id, targetBreadcrumb.name, newBreadcrumbPath);
    }

    // Function to toggle manual exploration visibility
    function toggleManualExploration() {
        const manualCategorySection = document.querySelector('.manual-category-section');
        const toggleButton = document.querySelector('.btn-toggle-manual');

        if (!manualCategorySection || !toggleButton) return;

        if (manualCategorySection.style.display === 'none') {
            // Show manual exploration
            manualCategorySection.style.display = 'block';
            toggleButton.innerHTML = DOMPurify.sanitize(`
                <i class="fas fa-chevron-up"></i>
                Ocultar exploración manual
            `);

            // Load root categories when showing manual exploration
            loadRootCategories();
        } else {
            // Hide manual exploration
            manualCategorySection.style.display = 'none';
            toggleButton.innerHTML = DOMPurify.sanitize(`
                <i class="fas fa-search"></i>
                ¿No encuentras la categoría correcta? Explorar manualmente
            `);
        }
    }

    // Make toggleManualExploration globally available
    window.toggleManualExploration = toggleManualExploration;

    // Make navigateToBreadcrumb globally available
    window.navigateToBreadcrumb = navigateToBreadcrumb;

    // Helper function to pre-fill configuration fields
    function prefillConfigurationFields() {
        if (!selectedProduct) return;

        // Pre-fill pricing from product data
        const priceField = document.getElementById('productPrice');
        if (priceField && selectedProduct.price) {
            // Convert USD to COP (approximate rate for demo - in production, use real exchange rate)
            const copPrice = Math.round(selectedProduct.price * 4000); // Approximate USD to COP
            priceField.value = copPrice;
        }

        // Pre-fill inventory
        const quantityField = document.getElementById('availableQuantity');
        if (quantityField && selectedProduct.stock) {
            quantityField.value = selectedProduct.stock;
        }

        // Pre-fill SKU
        const skuField = document.getElementById('sellerSku');
        if (skuField && selectedProduct.sku) {
            skuField.value = selectedProduct.sku;
        }

        // Pre-fill package dimensions from product data if available
        const productAttributes = parseHTMLTable(selectedProduct.description.es);

        // Try to extract dimensions from product description
        const dimensionsMapping = {
            'packageLength': ['LARGO', 'LENGTH', 'LONGITUD'],
            'packageWidth': ['ANCHO', 'WIDTH', 'ANCHURA'],
            'packageHeight': ['ALTO', 'HEIGHT', 'ALTURA'],
            'packageWeight': ['PESO', 'WEIGHT', 'PESO KG']
        };

        Object.entries(dimensionsMapping).forEach(([fieldId, possibleKeys]) => {
            const field = document.getElementById(fieldId);
            if (field) {
                for (const key of possibleKeys) {
                    const value = productAttributes[key];
                    if (value) {
                        // Extract numeric value
                        const numericValue = value.match(/[\d.]+/);
                        if (numericValue) {
                            field.value = numericValue[0];
                            break;
                        }
                    }
                }
            }
        });

    }

    // Setup GTIN field behavior
    function setupGtinFieldBehavior() {
        const gtinField = document.getElementById('productGtin');
        const gtinReasonGroup = document.getElementById('gtinReasonGroup');

        if (gtinField && gtinReasonGroup) {
            gtinField.addEventListener('input', function() {
                if (this.value.trim()) {
                    gtinReasonGroup.style.display = 'none';
                } else {
                    gtinReasonGroup.style.display = 'block';
                }
            });

            // Initial state
            if (!gtinField.value.trim()) {
                gtinReasonGroup.style.display = 'block';
            }
        }
    }

    // Clear all form fields
    function clearAllFormFields() {
        // Clear pricing fields
        const pricingFields = ['productPrice', 'listingType'];
        pricingFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });

        // Clear inventory fields
        const inventoryFields = ['availableQuantity', 'sellerSku'];
        inventoryFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });

        // Clear identifier fields
        const identifierFields = ['productGtin'];
        identifierFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });
    }

    // Helper function to check if an attribute is required
    function isAttributeRequired(attr) {
        return attr.required === true ||
               (attr.tags && attr.tags.required === true) ||
               (attr.tags && attr.tags.includes && attr.tags.includes('required')) ||
               (attr.hierarchy === 'REQUIRED') ||
               (attr.value_type === 'required');
    }

    // Helper function to generate attribute field HTML
    function generateAttributeField(attribute, isRequired) {
        const attributeId = attribute.id;
        const attributeName = attribute.name;
        const hint = attribute.hint || '';

        // Double-check if attribute is actually required using our helper function
        const actuallyRequired = isAttributeRequired(attribute);

        let inputHTML = '';

        if (attribute.values && attribute.values.length > 0) {
            // Select dropdown for predefined values
            inputHTML = `
                <select class="attribute-select" data-attribute-id="${attributeId}" ${actuallyRequired ? 'required' : ''}>
                    <option value="">Seleccionar...</option>
                    ${attribute.values.map(value =>
                        `<option value="${value.id}">${value.name}</option>`
                    ).join('')}
                </select>
            `;
        } else {
            // Text input for free text
            const inputType = attribute.value_type === 'number' ? 'number' : 'text';
            inputHTML = `
                <input type="${inputType}" class="attribute-input" data-attribute-id="${attributeId}"
                       placeholder="Ingresa ${attributeName.toLowerCase()}" ${actuallyRequired ? 'required' : ''}
                       ${attribute.max_length ? `maxlength="${attribute.max_length}"` : ''}>
            `;
        }

        return `
            <div class="attribute-group ${actuallyRequired ? 'required' : 'optional'}">
                <div class="attribute-label">
                    <span class="attribute-name">${attributeName}</span>
                    ${actuallyRequired ? '<span class="attribute-required-badge">REQUERIDO</span>' : '<span class="attribute-optional-badge">OPCIONAL</span>'}
                </div>
                ${inputHTML}
                ${hint ? `<div class="attribute-hint">${hint}</div>` : ''}
            </div>
        `;
    }

    // Function to apply attribute mapping from product data
    function applyAttributeMapping(productAttributeMapping) {
        if (!selectedProduct || !productAttributeMapping) return;

        // Apply mapped values to form fields
        Object.keys(productAttributeMapping).forEach(attributeId => {
            const value = productAttributeMapping[attributeId];
            const field = document.querySelector(`[data-attribute-id="${attributeId}"]`);

            if (field && value) {
                if (field.tagName === 'SELECT') {
                    // For select fields, try to find matching option
                    const options = field.querySelectorAll('option');
                    let matched = false;

                    for (let option of options) {
                        if (option.value === value ||
                            option.textContent.toLowerCase() === value.toLowerCase() ||
                            option.textContent.toLowerCase().includes(value.toLowerCase())) {
                            option.selected = true;
                            matched = true;
                            break;
                        }
                    }

                    if (matched) {
                        field.style.backgroundColor = '#e8f5e8';
                        field.title = '✓ Auto-completado desde datos del producto';

                        // Add visual indicator
                        const attributeGroup = field.closest('.attribute-group');
                        if (attributeGroup && !attributeGroup.querySelector('.attribute-prefilled')) {
                            const label = attributeGroup.querySelector('.attribute-label');
                            if (label) {
                                label.insertAdjacentHTML('beforeend', '<span class="attribute-prefilled">✓ Auto-completado</span>');
                            }
                        }
                    }
                } else {
                    // For input fields
                    field.value = value;
                    field.style.backgroundColor = '#e8f5e8';
                    field.title = '✓ Auto-completado desde datos del producto';

                    // Add visual indicator
                    const attributeGroup = field.closest('.attribute-group');
                    if (attributeGroup && !attributeGroup.querySelector('.attribute-prefilled')) {
                        const label = attributeGroup.querySelector('.attribute-label');
                        if (label) {
                            label.insertAdjacentHTML('beforeend', '<span class="attribute-prefilled">✓ Auto-completado</span>');
                        }
                    }
                }
            }
        });
    }
});
