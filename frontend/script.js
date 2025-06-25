// Shopping cart state
let cart = [];
let cartModal = document.getElementById('cart-modal');
let closeBtn = document.getElementsByClassName('close')[0];
let cartIcon = document.getElementById('cart-icon');
let emptyCartBtn = document.getElementById('empty-cart');

// Load cart from localStorage
function loadCart() {
    const savedCart = localStorage.getItem('petStoreCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartUI();
    }
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('petStoreCart', JSON.stringify(cart));
}

// Event listeners
cartIcon.onclick = () => cartModal.style.display = 'block';
closeBtn.onclick = () => cartModal.style.display = 'none';
emptyCartBtn.onclick = emptyCart;

window.onclick = (event) => {
    if (event.target == cartModal) {
        cartModal.style.display = 'none';
    }
};

// Initialize products
async function initializeProducts() {
    console.log('Initializing products...');
    const container = document.getElementById('products-container');
    const template = document.getElementById('product-template');

    try {
        const response = await fetch('/api/products');
        const products = await response.json();

        console.log('Available products:', products);
        products.forEach(product => {
            const productElement = template.content.cloneNode(true);

            // Set product data
            const card = productElement.querySelector('.product-card');
            // Store all categories for filtering, separated by space
            const productCategoryNames = (product.categories || []).map(cat => {
                if (cat && cat.name && cat.name.es) {
                    return cat.name.es.toLowerCase();
                }
                return '';
            }).filter(name => name); // Filter out empty strings

            card.dataset.categories = productCategoryNames.length > 0 ? productCategoryNames.join(' ') : 'uncategorized';
            card.dataset.productId = product.id; // Store product ID for navigation

            card.addEventListener('click', (e) => {
                // Allow add to cart and quantity controls to work without navigating
                if (e.target.closest('.product-actions')) {
                    return;
                }
                window.location.href = `product-detail.html?id=${product.id}`;
            });

            const img = productElement.querySelector('.product-image');
            // Using the first image as the product image
            img.src = product.images && product.images.length > 0 ? product.images[0].src : 'https://via.placeholder.com/300';
            img.alt = product.name.es;

            productElement.querySelector('.product-title').textContent = product.name.es;
            // Description is no longer displayed
            // const descriptionHtml = product.description.es;
            // const tempDiv = document.createElement('div');
            // tempDiv.innerHTML = descriptionHtml;
            // productElement.querySelector('.product-description').textContent = tempDiv.textContent || tempDiv.innerText || "No description available.";

            // Assuming the first variant holds the price and stock
            const firstVariant = product.variants[0];
            productElement.querySelector('.product-price').textContent = `$${parseFloat(firstVariant.price).toFixed(2)}`;

            const actualStock = firstVariant.stock === null ? 100 : firstVariant.stock;
            const stockText = `Stock: ${actualStock} units`;
            productElement.querySelector('.product-stock').textContent = stockText;

            // Set up quantity controls
            const quantityInput = productElement.querySelector('.quantity-input');
            const minusBtn = productElement.querySelector('.minus');
            const plusBtn = productElement.querySelector('.plus');

            minusBtn.onclick = () => updateQuantity(quantityInput, -1, actualStock);
            plusBtn.onclick = () => updateQuantity(quantityInput, 1, actualStock);
            quantityInput.onchange = () => validateQuantity(quantityInput, actualStock);

            // Set up add to cart button
            const addToCartBtn = productElement.querySelector('.add-to-cart-btn');
            console.log('Setting up add to cart button for:', product.name.es);
            addToCartBtn.onclick = () => {
                console.log('Add to cart button clicked for:', product.name.es);
                // Adapt product object for cart
                const cartProduct = {
                    id: product.id,
                    title: product.name.es,
                    price: parseFloat(firstVariant.price),
                    stock: actualStock, // Use actualStock (100 if null, else original stock)
                    imageUrl: product.images.length > 0 ? product.images[0].src : 'https://via.placeholder.com/300'
                };
                addToCart(cartProduct, parseInt(quantityInput.value));
            };

            container.appendChild(productElement);
        });

        // Set up category filters based on fetched products
        setupCategoryFilters(products);

    } catch (error) {
        console.error('Error fetching or processing products:', error);
        // Display an error message to the user
        const container = document.getElementById('products-container');
        container.innerHTML = DOMPurify.sanitize('<p class="error-message">Could not load products. Please try again later.</p>');
    }
}

// Update quantity
function updateQuantity(input, change, maxStock) {
    let currentVal = parseInt(input.value);
    if (isNaN(currentVal)) currentVal = 1;
    let newValue = currentVal + change;
    validateQuantity(input, maxStock, newValue); // maxStock is now always a number
}

// Validate quantity
function validateQuantity(input, maxStock, value = null) {
    let newValue = value !== null ? value : parseInt(input.value);
    if (isNaN(newValue)) newValue = 1;
    newValue = Math.max(1, Math.min(newValue, maxStock)); // maxStock is always a number
    input.value = newValue;
}

// Setup category filters
function setupCategoryFilters(products) {
    const filterContainer = document.querySelector('.filters'); // Assuming you have a container with class 'filters'
    if (!filterContainer) {
        console.warn("Filter container not found. Skipping category filter setup.");
        return;
    }

    const categories = new Set();
    products.forEach(product => {
        if (product.categories && Array.isArray(product.categories)) {
            product.categories.forEach(cat => {
                if (cat && cat.name && cat.name.es) {
                    categories.add(cat.name.es.toLowerCase());
                }
            });
        }
    });

    filterContainer.innerHTML = DOMPurify.sanitize('<button class="filter-btn active" data-category="all">All</button>'); // Reset filters
    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.category = category;
        btn.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        filterContainer.appendChild(btn);
    });

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter products
            const selectedCategory = btn.dataset.category;
            const productCards = document.querySelectorAll('.product-card');

            productCards.forEach(card => {
                const cardCategories = card.dataset.categories; // e.g., "bicicletas scott"
                if (selectedCategory === 'all' || (cardCategories && cardCategories.split(' ').includes(selectedCategory))) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// Add item to cart
function addToCart(product, quantity) {
    console.log('Adding to cart:', product, quantity);
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        // Update quantity if product already in cart
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity <= product.stock) { // product.stock in cart is now always a number
            existingItem.quantity = newQuantity;
            showNotification(`Updated ${product.title} quantity to ${newQuantity}`);
        } else {
            showNotification(`Not enough stock for ${product.title}. Max: ${product.stock}`, 'error');
            return;
        }
    } else {
        // Add new item to cart
        if (quantity > product.stock) { // product.stock in cart is now always a number
            showNotification(`Not enough stock for ${product.title}. Max: ${product.stock}`, 'error');
            return;
        }
        cart.push({
            id: product.id,
            title: product.title,
            unit_price: product.price, // Ensure this is product.price from the adapted cartProduct
            quantity: quantity,
            imageUrl: product.imageUrl
        });
        showNotification(`Added ${quantity} ${product.title} to cart`);
    }

    updateCartUI();
    saveCart();
}

// Remove item from cart
function removeFromCart(index) {
    const item = cart[index];
    cart.splice(index, 1);
    showNotification(`Removed ${item.title} from cart`);
    updateCartUI();
    saveCart();
}

// Empty cart
function emptyCart() {
    cart = [];
    showNotification('Cart emptied');
    updateCartUI();
    saveCart();
}

// Update cart UI
function updateCartUI() {
    // Update cart count
    const cartCount = document.getElementById('cart-count');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Update cart items
    const cartItems = document.getElementById('cart-items');
    cartItems.innerHTML = '';

    cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = DOMPurify.sanitize(`
            <img src="${item.imageUrl}" alt="${item.title}">
            <div class="cart-item-details">
                <h3 class="cart-item-title">${item.title}</h3>
                <p class="cart-item-price">$${item.unit_price} x ${item.quantity}</p>
                <p class="cart-item-subtotal">Subtotal: $${(item.unit_price * item.quantity).toFixed(2)}</p>
            </div>
            <i class="fas fa-trash remove-item" data-index="${index}"></i>
        `);
        // Add event listener for remove button
        cartItem.querySelector('.remove-item').addEventListener('click', function(){
            removeFromCart(parseInt(this.dataset.index));
        });
        cartItems.appendChild(cartItem);
    });

    // Update total
    const total = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    document.getElementById('cart-total').textContent = `$${total.toFixed(2)}`;
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize the store
document.addEventListener('DOMContentLoaded', () => {
    initializeProducts();
    loadCart();
});

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #4CAF50;
        color: white;
        padding: 15px 25px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.5s ease-out;
    }

    .notification.error {
        background-color: #f44336;
    }

    .notification.info {
        background-color: #2196F3;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
