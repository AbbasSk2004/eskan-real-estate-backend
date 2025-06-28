# Scikit-learn Recommendation System

This folder contains the scikit-learn based recommendation system for the real estate application. The system uses machine learning to provide personalized property recommendations based on user behavior and property characteristics.

## Features

- **Property Similarity**: Find similar properties based on features like price, location, size, etc.
- **User Recommendations**: Generate personalized recommendations based on user viewing history
- **Hybrid Approach**: Combines content-based filtering with popularity metrics
- **Fallback Mechanism**: Falls back to JavaScript-based recommendations if Python fails

## Setup

1. Make sure you have Python 3.x installed on your system
2. Run the setup script:

```bash
npm run setup-ml
```

This will install all required Python dependencies.

## How It Works

The recommendation system uses several machine learning techniques:

1. **Feature Engineering**: Converts property attributes into numerical vectors
2. **Dimensionality Reduction**: Uses one-hot encoding for categorical features
3. **Similarity Calculation**: Uses cosine similarity to find similar properties
4. **Recommendation Ranking**: Ranks recommendations by relevance and popularity

## API Integration

The recommendation system is integrated with the Node.js backend through two main endpoints:

- `/api/recommendation/recommended` - Get personalized recommendations
- `/api/recommendation/similar/:propertyId` - Get similar properties

## Technical Details

- Uses scikit-learn's preprocessing tools for feature normalization
- Implements cosine similarity for property matching
- Handles both categorical and numerical features
- Gracefully degrades to JavaScript implementation if Python fails

## Requirements

- Python 3.6+
- Node.js 16+
- NPM dependencies listed in package.json
- Python dependencies:
  - numpy
  - pandas
  - scikit-learn
  - scipy