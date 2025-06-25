const axios = require('axios');

class MLCategoryService {
    constructor(mlAuth) {
        this.mlAuth = mlAuth;
        this.siteId = 'MCO'; // Colombia
        this.baseUrl = 'https://api.mercadolibre.com';
    }

    // Predict categories for a product using smart category matching
    async predictCategories(productTitle, productDescription = '') {
        try {
            // First try the official Category Predictor API
            try {
                const searchQuery = `${productTitle} ${productDescription}`.trim();
                const englishQuery = await this.translateToEnglish(searchQuery);

                const response = await this.mlAuth.apiRequest(
                    'GET',
                    `/sites/${this.siteId}/domain_discovery/search?q=${encodeURIComponent(englishQuery)}`
                );

                // Process and rank predictions
                const predictions = response.map((prediction, index) => ({
                    rank: index + 1,
                    confidence: this.calculateConfidence(index, response.length),
                    domain_id: prediction.domain_id,
                    domain_name: prediction.domain_name,
                    category_id: prediction.category_id,
                    category_name: prediction.category_name,
                    attributes: prediction.attributes || [],
                    recommended: index === 0
                }));

                return {
                    success: true,
                    query: searchQuery,
                    english_query: englishQuery,
                    predictions: predictions,
                    total_predictions: predictions.length,
                    method: 'api_predictor'
                };
            } catch (apiError) {
                console.log('Category Predictor API not available, using smart matching...');

                // Fallback to smart category matching
                return await this.smartCategoryMatching(productTitle, productDescription);
            }

        } catch (error) {
            console.error('Error predicting categories:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message,
                predictions: []
            };
        }
    }

    // Smart category matching using keyword analysis
    async smartCategoryMatching(productTitle, productDescription = '') {
        try {
            const searchQuery = `${productTitle} ${productDescription}`.trim().toLowerCase();

            // Get all categories for MCO
            const categoriesResponse = await this.mlAuth.apiRequest('GET', '/sites/MCO/categories');

            // Define bike-related keywords and their category mappings
            const bikeKeywords = {
                'bicicleta': ['MCO1292'], // Ciclismo
                'bike': ['MCO1292'],
                'ciclismo': ['MCO1292'],
                'cycling': ['MCO1292'],
                'montaña': ['MCO1292'],
                'mountain': ['MCO1292'],
                'carretera': ['MCO1292'],
                'road': ['MCO1292'],
                'bmx': ['MCO1292'],
                'casco': ['MCO1292'],
                'helmet': ['MCO1292'],
                'deportes': ['MCO1276'], // Deportes y Fitness
                'sports': ['MCO1276'],
                'fitness': ['MCO1338'], // Fitness y Musculación
                'accesorios': ['MCO1292']
            };

            // Find matching categories
            const matches = [];

            // Check for direct keyword matches
            for (const [keyword, categoryIds] of Object.entries(bikeKeywords)) {
                if (searchQuery.includes(keyword)) {
                    for (const categoryId of categoryIds) {
                        const category = categoriesResponse.find(c => c.id === categoryId);
                        if (category && !matches.find(m => m.category_id === categoryId)) {
                            matches.push({
                                category_id: categoryId,
                                category_name: category.name,
                                confidence: this.calculateKeywordConfidence(keyword, searchQuery),
                                keyword_matched: keyword
                            });
                        }
                    }
                }
            }

            // If no direct matches, search in category names
            if (matches.length === 0) {
                const searchTerms = searchQuery.split(' ').filter(term => term.length > 2);

                for (const category of categoriesResponse) {
                    for (const term of searchTerms) {
                        if (category.name.toLowerCase().includes(term)) {
                            matches.push({
                                category_id: category.id,
                                category_name: category.name,
                                confidence: 60,
                                keyword_matched: term
                            });
                            break;
                        }
                    }
                }
            }

            // Sort by confidence and limit results
            matches.sort((a, b) => b.confidence - a.confidence);
            const topMatches = matches.slice(0, 5);

            // Format as predictions
            const predictions = topMatches.map((match, index) => ({
                rank: index + 1,
                confidence: match.confidence,
                domain_id: 'MCO-SMART-MATCH',
                domain_name: 'Smart Category Match',
                category_id: match.category_id,
                category_name: match.category_name,
                attributes: [],
                recommended: index === 0,
                keyword_matched: match.keyword_matched
            }));

            return {
                success: true,
                query: productTitle + ' ' + productDescription,
                english_query: searchQuery,
                predictions: predictions,
                total_predictions: predictions.length,
                method: 'smart_matching',
                debug: {
                    searchQuery: searchQuery,
                    matchesFound: matches.length,
                    topMatches: topMatches
                }
            };

        } catch (error) {
            console.error('Error in smart category matching:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message,
                predictions: []
            };
        }
    }

    // Calculate confidence based on keyword relevance
    calculateKeywordConfidence(keyword, searchQuery) {
        const keywordImportance = {
            'bicicleta': 95,
            'bike': 95,
            'ciclismo': 90,
            'cycling': 90,
            'montaña': 85,
            'mountain': 85,
            'carretera': 85,
            'road': 80,
            'bmx': 90,
            'casco': 75,
            'helmet': 75,
            'deportes': 70,
            'sports': 70,
            'fitness': 80,
            'accesorios': 65
        };

        return keywordImportance[keyword] || 60;
    }

    // Get detailed category information
    async getCategoryDetails(categoryId) {
        try {
            const response = await this.mlAuth.apiRequest('GET', `/categories/${categoryId}`);
            return {
                success: true,
                category: response
            };
        } catch (error) {
            console.error('Error getting category details:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get root categories for the site
    async getRootCategories(siteId = 'MCO') {
        try {
            const response = await this.mlAuth.apiRequest('GET', `/sites/${siteId}/categories`);
            return response;
        } catch (error) {
            console.error('Error getting root categories:', error.response?.data || error.message);
            throw new Error(`Failed to get root categories: ${error.message}`);
        }
    }

    // Get category attributes and requirements
    async getCategoryAttributes(categoryId) {
        try {
            const response = await this.mlAuth.apiRequest('GET', `/categories/${categoryId}/attributes`);

            // Process attributes to identify required vs optional
            const processedAttributes = response.map(attr => {
                // Handle tags - they might be an object or array
                let tags = [];
                let isRequired = false;

                if (attr.tags) {
                    if (Array.isArray(attr.tags)) {
                        tags = attr.tags;
                        isRequired = tags.includes('required') ||
                                   tags.includes('catalog_required') ||
                                   tags.includes('catalog_listing_required');
                    } else if (typeof attr.tags === 'object') {
                        tags = Object.keys(attr.tags);
                        isRequired = tags.includes('required') ||
                                   tags.includes('catalog_required') ||
                                   tags.includes('catalog_listing_required');
                    }
                }

                return {
                    id: attr.id,
                    name: attr.name,
                    value_type: attr.value_type,
                    required: isRequired,
                    values: attr.values || [],
                    hierarchy: attr.hierarchy,
                    relevance: attr.relevance,
                    tags: tags,
                    max_length: attr.value_max_length,
                    hint: attr.hint,
                    tooltip: attr.tooltip
                };
            });

            const requiredAttributes = processedAttributes.filter(attr => attr.required);
            const optionalAttributes = processedAttributes.filter(attr => !attr.required);

            return {
                success: true,
                attributes: {
                    all: processedAttributes,
                    required: requiredAttributes,
                    optional: optionalAttributes,
                    total: processedAttributes.length,
                    required_count: requiredAttributes.length
                }
            };
        } catch (error) {
            console.error('Error getting category attributes:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Search categories manually (fallback option)
    async searchCategories(query, siteId = 'MCO') {
        try {
            // Get all categories for the site
            const response = await this.mlAuth.apiRequest('GET', `/sites/${siteId}/categories`);

            // Filter categories based on query
            const filteredCategories = response.filter(category =>
                category.name.toLowerCase().includes(query.toLowerCase())
            );

            return {
                success: true,
                categories: filteredCategories.slice(0, 20), // Limit to 20 results
                total: filteredCategories.length
            };
        } catch (error) {
            console.error('Error searching categories:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message,
                categories: []
            };
        }
    }

    // Get category tree/hierarchy
    async getCategoryHierarchy(categoryId) {
        try {
            const categoryDetails = await this.getCategoryDetails(categoryId);

            if (!categoryDetails.success) {
                return categoryDetails;
            }

            const category = categoryDetails.category;

            return {
                success: true,
                hierarchy: {
                    path_from_root: category.path_from_root || [],
                    children_categories: category.children_categories || [],
                    parent_path: this.buildParentPath(category.path_from_root || []),
                    is_leaf: !category.children_categories || category.children_categories.length === 0
                }
            };
        } catch (error) {
            console.error('Error getting category hierarchy:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Validate if a category is suitable for listing
    async validateCategoryForListing(categoryId) {
        try {
            const categoryDetails = await this.getCategoryDetails(categoryId);

            if (!categoryDetails.success) {
                return categoryDetails;
            }

            const category = categoryDetails.category;
            const settings = category.settings || {};

            const validation = {
                can_list: settings.listing_allowed !== false,
                reasons: [],
                warnings: [],
                requirements: {
                    pictures_required: settings.requires_picture || false,
                    max_pictures: settings.max_pictures_per_item || 12,
                    max_title_length: settings.max_title_length || 60,
                    max_description_length: settings.max_description_length || 50000,
                    price_required: settings.price === 'required',
                    stock_required: settings.stock === 'required',
                    minimum_price: settings.minimum_price || 0,
                    maximum_price: settings.maximum_price,
                    allowed_conditions: settings.item_conditions || ['new'],
                    allowed_currencies: settings.currencies || ['USD']
                }
            };

            // Check for listing restrictions
            if (!validation.can_list) {
                validation.reasons.push('Listing not allowed in this category');
            }

            if (settings.adult_content) {
                validation.warnings.push('This category contains adult content');
            }

            if (settings.restrictions && settings.restrictions.length > 0) {
                validation.warnings.push(`Category has restrictions: ${settings.restrictions.join(', ')}`);
            }

            return {
                success: true,
                validation: validation,
                category_info: {
                    id: category.id,
                    name: category.name,
                    path: category.path_from_root || []
                }
            };
        } catch (error) {
            console.error('Error validating category:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper: Calculate confidence score based on ranking
    calculateConfidence(index, total) {
        if (total === 1) return 95;

        const baseScore = 90;
        const penalty = (index * 15); // Decrease confidence by 15% per rank
        return Math.max(baseScore - penalty, 20);
    }

    // Helper: Simple translation to English (basic implementation)
    async translateToEnglish(text) {
        // For now, we'll assume the text is already in English or use a simple mapping
        // In production, you might want to integrate with a translation service

        const spanishToEnglish = {
            'bicicleta': 'bicycle',
            'bicicletas': 'bicycles',
            'montaña': 'mountain',
            'carretera': 'road',
            'ruta': 'road',
            'urbana': 'urban',
            'eléctrica': 'electric',
            'niños': 'kids',
            'adultos': 'adults',
            'casco': 'helmet',
            'cascos': 'helmets',
            'accesorios': 'accessories',
            'repuestos': 'parts',
            'llantas': 'tires',
            'frenos': 'brakes'
        };

        let translatedText = text.toLowerCase();

        Object.entries(spanishToEnglish).forEach(([spanish, english]) => {
            translatedText = translatedText.replace(new RegExp(spanish, 'g'), english);
        });

        return translatedText;
    }

    // Helper: Build readable parent path
    buildParentPath(pathFromRoot) {
        if (!pathFromRoot || pathFromRoot.length <= 1) {
            return '';
        }

        return pathFromRoot
            .slice(0, -1) // Remove the current category
            .map(cat => cat.name)
            .join(' > ');
    }

    // Get site-specific information
    async getSiteInfo(siteId = 'MCO') {
        try {
            const response = await this.mlAuth.apiRequest('GET', `/sites/${siteId}`);
            return {
                success: true,
                site: response
            };
        } catch (error) {
            console.error('Error getting site info:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MLCategoryService;
