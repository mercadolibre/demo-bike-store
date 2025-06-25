# Demo Bike Store

A web application for a bicycle store that allows customers to browse products and add them to cart.

## Features

- Browse products by category
- Shopping cart functionality (without checkout processing)
- Real-time inventory tracking
- Responsive design for mobile and desktop
- Product quantity controls
- Complete admin panel (CRUD)

## Admin Panel Features

- Complete product management (Create, Read, Update, Delete)
- Category management
- Image uploads for products
- Variant and stock control

## Technical Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js with Express
- Storage: JSON files
- Local storage for cart persistence

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

- `api/server.js` - Express server setup and API endpoints
- `api/db.json` - Products database
- `api/categories.json` - Categories database
- `api/uploads/` - Directory for uploaded images
- `frontend/index.html` - Main store page
- `frontend/admin.html` - Admin panel
- `frontend/script.js` - Store logic
- `frontend/admin.js` - Admin panel logic
- `frontend/styles.css` - Application styling

## Usage

### Store
1. Browse products using the category filters at the top of the page
2. Click the plus/minus buttons to adjust product quantities
3. Click "Add to Cart" to add items to your shopping cart
4. Click the cart icon to view your cart
5. Note: Checkout functionality is not implemented

### Admin Panel
1. Access the admin panel by clicking "Admin Panel" at the top of the page
2. Manage products: create, edit, and delete products
3. Manage categories: create, edit, and delete categories
4. Upload images for products
5. Configure variants and stock levels

## Development

The application uses a simple Express server to serve static files and handle API requests.
Product and category data are stored in JSON files for easy modification. The frontend uses vanilla JavaScript with no external dependencies for core functionality.
