document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    const productNameEl = document.getElementById('product-name');
    const mainProductImageEl = document.getElementById('main-product-image');
    const thumbnailImagesEl = document.getElementById('thumbnail-images');
    const productPriceEl = document.getElementById('product-price');
    const productStockEl = document.getElementById('product-stock');
    const productDescriptionTableEl = document.getElementById('product-description-table');
    const quantityInput = document.getElementById('quantity-input');
    const quantityMinusBtn = document.getElementById('quantity-minus');
    const quantityPlusBtn = document.getElementById('quantity-plus');
    const addToCartButton = document.getElementById('add-to-cart-button');

    let currentProduct = null; // To store the fetched product details
    let products = []; // To store all products

    async function fetchProductDetails() {
        try {
            const response = await fetch('/api/products');
            products = await response.json();
            currentProduct = products.find(p => p.id === productId);

            if (currentProduct) {
                displayProductDetails(currentProduct);
            } else {
                productNameEl.textContent = 'Producto no encontrado';
                // Hide other elements or show an error message
            }
        } catch (error) {
            console.error('Error fetching product details:', error);
            productNameEl.textContent = 'Error al cargar el producto';
        }
    }

    function displayProductDetails(product) {
        productNameEl.textContent = product.name.es;

        // Image Carousel/Thumbnails
        thumbnailImagesEl.innerHTML = ''; // Clear previous thumbnails
        if (product.images && product.images.length > 0) {
            mainProductImageEl.src = product.images[0].src;
            mainProductImageEl.alt = product.name.es;

            product.images.forEach((image, index) => {
                const thumb = document.createElement('img');
                thumb.src = image.src;
                thumb.alt = `Thumbnail ${index + 1} for ${product.name.es}`;
                thumb.classList.add('thumbnail-img');
                if (index === 0) thumb.classList.add('active');
                thumb.addEventListener('click', () => {
                    mainProductImageEl.src = image.src;
                    document.querySelectorAll('.thumbnail-img.active').forEach(activeThumb => activeThumb.classList.remove('active'));
                    thumb.classList.add('active');
                });
                thumbnailImagesEl.appendChild(thumb);
            });
        } else {
            mainProductImageEl.src = 'https://via.placeholder.com/600x400?text=No+Image';
            mainProductImageEl.alt = 'No image available';
        }

        const firstVariant = product.variants[0];
        productPriceEl.textContent = `$${parseFloat(firstVariant.price).toFixed(2)}`;
        const originalStock = firstVariant.stock;
        const actualStock = originalStock === null ? 100 : originalStock;
        productStockEl.textContent = `Stock: ${actualStock} units`;

        // Handle description with language support
        const description = product.description && product.description.es ? product.description.es : product.description || 'No hay descripción disponible';
        productDescriptionTableEl.innerHTML = DOMPurify.sanitize(description);

        // Quantity controls
        quantityMinusBtn.onclick = () => updateQuantity(quantityInput, -1, actualStock);
        quantityPlusBtn.onclick = () => updateQuantity(quantityInput, 1, actualStock);
        quantityInput.onchange = () => validateQuantity(quantityInput, actualStock);

        // Add to Cart button
        addToCartButton.onclick = () => {
            const cartProduct = {
                id: product.id,
                title: product.name.es,
                price: parseFloat(firstVariant.price),
                stock: actualStock,
                imageUrl: product.images.length > 0 ? product.images[0].src : 'https://via.placeholder.com/300'
            };
            addToCart(cartProduct, parseInt(quantityInput.value));
        };
    }

    fetchProductDetails();

    // --- Cart Functionality (copied and adapted from script.js) ---
    let cart = [];
    let cartModal = document.getElementById('cart-modal');
    let closeBtn = document.getElementsByClassName('close')[0];
    let cartIcon = document.getElementById('cart-icon');
    let emptyCartBtn = document.getElementById('empty-cart');

    function loadCart() {
        const savedCart = localStorage.getItem('petStoreCart'); // Consider a different key for bikeStore
        if (savedCart) {
            cart = JSON.parse(savedCart);
            updateCartUI();
        }
    }

    function saveCart() {
        localStorage.setItem('petStoreCart', JSON.stringify(cart)); // Consider a different key for bikeStore
    }

    if(cartIcon) cartIcon.onclick = () => cartModal.style.display = 'block';
    if(closeBtn) closeBtn.onclick = () => cartModal.style.display = 'none';
    if(emptyCartBtn) emptyCartBtn.onclick = emptyCartHandler;

    window.onclick = (event) => {
        if (event.target == cartModal) {
            cartModal.style.display = 'none';
        }
    };

    function updateQuantity(input, change, maxStock) {
        let currentVal = parseInt(input.value);
        if (isNaN(currentVal)) currentVal = 1;
        let newValue = currentVal + change;
        validateQuantity(input, maxStock, newValue);
    }

    function validateQuantity(input, maxStock, value = null) {
        let newValue = value !== null ? value : parseInt(input.value);
        if (isNaN(newValue)) newValue = 1;
        newValue = Math.max(1, Math.min(newValue, maxStock));
        input.value = newValue;
    }

    function addToCart(product, quantity) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity <= product.stock) {
                existingItem.quantity = newQuantity;
                showNotification(`Updated ${product.title} quantity to ${newQuantity}`);
            } else {
                showNotification(`Not enough stock for ${product.title}. Max: ${product.stock}`, 'error');
                return;
            }
        } else {
            if (quantity > product.stock) {
                showNotification(`Not enough stock for ${product.title}. Max: ${product.stock}`, 'error');
                return;
            }
            cart.push({
                id: product.id,
                title: product.title,
                unit_price: product.price,
                quantity: quantity,
                imageUrl: product.imageUrl
            });
            showNotification(`Added ${quantity} ${product.title} to cart`);
        }
        updateCartUI();
        saveCart();
    }

    function removeFromCart(index) {
        const item = cart[index];
        cart.splice(index, 1);
        showNotification(`Removed ${item.title} from cart`);
        updateCartUI();
        saveCart();
    }

    function emptyCartHandler() { // Renamed to avoid conflict if script.js is ever loaded on same page
        cart = [];
        showNotification('Cart emptied');
        updateCartUI();
        saveCart();
    }

    function updateCartUI() {
        const cartCount = document.getElementById('cart-count');
        if (!cartCount) return; // Element might not exist on this page if header is different
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = totalItems;

        const cartItemsEl = document.getElementById('cart-items');
        if (!cartItemsEl) return;
        cartItemsEl.innerHTML = '';

        cart.forEach((item, index) => {
            const cartItemDiv = document.createElement('div');
            cartItemDiv.className = 'cart-item';
            cartItemDiv.innerHTML = DOMPurify.sanitize(`
                <img src="${item.imageUrl}" alt="${item.title}">
                <div class="cart-item-details">
                    <h3 class="cart-item-title">${item.title}</h3>
                    <p class="cart-item-price">$${item.unit_price} x ${item.quantity}</p>
                    <p class="cart-item-subtotal">Subtotal: $${item.unit_price * item.quantity}</p>
                </div>
                <i class="fas fa-trash remove-item" data-index="${index}"></i>
            `);
            // Add event listener for new remove buttons
            cartItemDiv.querySelector('.remove-item').addEventListener('click', function(){
                removeFromCart(parseInt(this.dataset.index));
            });
            cartItemsEl.appendChild(cartItemDiv);
        });

        const cartTotalEl = document.getElementById('cart-total');
        if (!cartTotalEl) return;
        const total = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
        cartTotalEl.textContent = `$${total.toFixed(2)}`;
    }

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    loadCart(); // Load cart when page loads
});
