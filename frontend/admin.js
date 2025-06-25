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
            rootLabel.innerHTML = DOMPurify.sanitize(`Add commentMore actions
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
});
