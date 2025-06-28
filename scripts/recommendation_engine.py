#!/usr/bin/env python3
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics.pairwise import cosine_similarity
import json
import sys
import os
import traceback
import time

# Constants for feature importance
FEATURE_WEIGHTS = {
    'property_type': 5.0,
    'price': 3.0,
    'area': 2.0,
    'bedrooms': 1.5,
    'bathrooms': 1.5,
    'location': 4.0,  # Combined weight for governate/city
    'features': 2.0   # For JSON features
}

# Set maximum number of properties to process to avoid timeout
MAX_PROPERTIES = 500

def preprocess_properties(properties_data):
    """Convert properties to DataFrame and preprocess for ML"""
    # Performance tracking
    start_time = time.time()
    
    print(f"Preprocessing {len(properties_data) if isinstance(properties_data, list) else 'unknown'} properties", file=sys.stderr)
    
    # Limit number of properties to process
    if isinstance(properties_data, list) and len(properties_data) > MAX_PROPERTIES:
        print(f"Limiting properties from {len(properties_data)} to {MAX_PROPERTIES}", file=sys.stderr)
        properties_data = properties_data[:MAX_PROPERTIES]
    
    # Convert to DataFrame if it's a list of dictionaries
    if isinstance(properties_data, list):
        if not properties_data:
            return pd.DataFrame()  # Return empty DataFrame if no properties
        df = pd.DataFrame(properties_data)
    else:
        df = properties_data.copy()
    
    # Check if DataFrame is empty
    if df.empty:
        return df
    
    try:
        # Handle missing values
        if 'price' in df.columns:
            df['price'] = pd.to_numeric(df['price'], errors='coerce')
            df['price'] = df['price'].fillna(df['price'].median() if not df['price'].empty else 0)
        else:
            df['price'] = 0
            
        if 'area' in df.columns:
            df['area'] = pd.to_numeric(df['area'], errors='coerce')
            df['area'] = df['area'].fillna(df['area'].median() if not df['area'].empty else 0)
        else:
            df['area'] = 0
            
        if 'bedrooms' in df.columns:
            df['bedrooms'] = pd.to_numeric(df['bedrooms'], errors='coerce')
            df['bedrooms'] = df['bedrooms'].fillna(0).astype(int)
        else:
            df['bedrooms'] = 0
            
        if 'bathrooms' in df.columns:
            df['bathrooms'] = pd.to_numeric(df['bathrooms'], errors='coerce')
            df['bathrooms'] = df['bathrooms'].fillna(0).astype(int)
        else:
            df['bathrooms'] = 0
        
        # Ensure property_type exists
        if 'property_type' not in df.columns:
            df['property_type'] = 'Unknown'
        else:
            df['property_type'] = df['property_type'].fillna('Unknown')
        
        # Fill missing location data
        if 'governate' not in df.columns:
            df['governate'] = 'Unknown'
        else:
            df['governate'] = df['governate'].fillna('Unknown')
            
        if 'city' not in df.columns:
            df['city'] = 'Unknown'
        else:
            df['city'] = df['city'].fillna('Unknown')
        
        # Create a combined location feature
        df['location'] = df['governate'] + '_' + df['city']
        
        # Extract features from JSON if available
        if 'features' in df.columns:
            df['features_count'] = df['features'].apply(
                lambda x: len(json.loads(x)) if isinstance(x, str) and x else 0
            )
        else:
            df['features_count'] = 0
        
        # Ensure created_at exists for sorting
        if 'created_at' not in df.columns:
            df['created_at'] = pd.Timestamp.now()
        
        # Ensure is_featured exists
        if 'is_featured' not in df.columns:
            df['is_featured'] = False
        
        print(f"Preprocessing completed in {time.time() - start_time:.2f} seconds", file=sys.stderr)
        return df
        
    except Exception as e:
        print(f"Error in preprocessing: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        # Return original DataFrame with minimal processing
        for col in ['price', 'area', 'bedrooms', 'bathrooms']:
            if col in df.columns:
                df[col] = df[col].fillna(0)
        if 'property_type' in df.columns:
            df['property_type'] = df['property_type'].fillna('Unknown')
        if 'governate' in df.columns:
            df['governate'] = df['governate'].fillna('Unknown')
        if 'city' in df.columns:
            df['city'] = df['city'].fillna('Unknown')
        df['location'] = df.get('governate', 'Unknown') + '_' + df.get('city', 'Unknown')
        df['features_count'] = 0
        return df

def create_feature_matrix(df):
    """Transform property data into a feature matrix for ML"""
    start_time = time.time()
    
    # Check if DataFrame is empty
    if df.empty:
        return np.array([]), None
    
    try:
        # Define which columns are numeric vs categorical
        numeric_features = ['price', 'area', 'bedrooms', 'bathrooms', 'features_count']
        categorical_features = ['property_type', 'location']
        
        # Filter to include only columns that exist in the dataframe
        numeric_features = [col for col in numeric_features if col in df.columns]
        categorical_features = [col for col in categorical_features if col in df.columns]
        
        # If no features available, return empty matrix
        if not numeric_features and not categorical_features:
            return np.array([]), None
        
        # Create preprocessing pipeline
        transformers = []
        
        if numeric_features:
            numeric_transformer = Pipeline(steps=[
                ('scaler', StandardScaler())
            ])
            transformers.append(('num', numeric_transformer, numeric_features))
        
        if categorical_features:
            categorical_transformer = Pipeline(steps=[
                ('onehot', OneHotEncoder(handle_unknown='ignore'))
            ])
            transformers.append(('cat', categorical_transformer, categorical_features))
        
        # Column transformer to process different column types
        preprocessor = ColumnTransformer(transformers=transformers)
        
        # Fit and transform data
        feature_matrix = preprocessor.fit_transform(df)
        print(f"Feature matrix created in {time.time() - start_time:.2f} seconds, shape: {feature_matrix.shape}", file=sys.stderr)
        return feature_matrix, preprocessor
        
    except Exception as e:
        print(f"Error creating feature matrix: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        # Return empty matrix if transformation fails
        return np.array([]), None

def find_similar_properties(property_id, df, feature_matrix, n=5):
    """Find similar properties to the given property ID"""
    start_time = time.time()
    
    # Check if DataFrame or feature matrix is empty
    if df.empty or feature_matrix.size == 0:
        return []
    
    try:
        # Get index of the target property
        idx = df.index[df['id'] == property_id].tolist()[0]
        
        # Ensure the row is 2-D for dense numpy arrays
        row_vector = feature_matrix[idx]
        if hasattr(row_vector, 'shape') and len(row_vector.shape) == 1:
            row_vector = row_vector.reshape(1, -1)

        similarities = cosine_similarity(row_vector, feature_matrix).flatten()
        
        # Get indices of most similar properties (excluding self)
        similar_indices = similarities.argsort()[::-1]
        similar_indices = [i for i in similar_indices if i != idx][:n]
        
        # Return list of similar property IDs
        similar_ids = df.iloc[similar_indices]['id'].tolist()
        
        print(f"Found similar properties in {time.time() - start_time:.2f} seconds", file=sys.stderr)
        return similar_ids
        
    except (IndexError, KeyError) as e:
        print(f"Property ID {property_id} not found in dataset: {str(e)}", file=sys.stderr)
        return []  # Property not found
    except Exception as e:
        print(f"Error finding similar properties: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return []

def get_recommendations_for_user(user_history, all_properties, n=5):
    """Get recommendations based on user's viewing history"""
    start_time = time.time()
    print(f"Starting user recommendations with {len(user_history)} history items and {len(all_properties)} properties", file=sys.stderr)
    
    if not user_history or not all_properties:
        print("No history or properties provided", file=sys.stderr)
        return []
    
    try:
        # Preprocess all properties
        df = preprocess_properties(all_properties)
        
        # If DataFrame is empty, return empty list
        if df.empty:
            print("Empty DataFrame after preprocessing", file=sys.stderr)
            return []
        
        # Create feature matrix
        feature_matrix, _ = create_feature_matrix(df)
        
        # If feature matrix is empty, return empty list
        if feature_matrix.size == 0:
            print("Empty feature matrix", file=sys.stderr)
            return []
        
        # For each property in user history, find similar properties
        all_recommendations = []
        for history_item in user_history:
            property_id = history_item.get('property_id')
            if property_id:
                similar_ids = find_similar_properties(property_id, df, feature_matrix)
                all_recommendations.extend(similar_ids)
        
        # If no recommendations found, return empty list
        if not all_recommendations:
            print("No recommendations found", file=sys.stderr)
            return []
        
        # Count frequency of recommendations to prioritize
        from collections import Counter
        recommendation_counts = Counter(all_recommendations)
        
        # Sort by frequency and get top N
        top_recommendations = [item for item, _ in recommendation_counts.most_common(n)]
        
        # If we don't have enough recommendations, add some popular properties
        if len(top_recommendations) < n:
            # Sort by is_featured, then by created_at
            remaining_needed = n - len(top_recommendations)
            
            # Filter out properties already in recommendations
            remaining_properties = df[~df['id'].isin(top_recommendations)]
            
            # Prioritize featured properties
            if 'is_featured' in remaining_properties.columns:
                featured = remaining_properties[remaining_properties['is_featured'] == True]
                if len(featured) > 0:
                    top_featured = featured.sort_values('created_at', ascending=False)['id'].tolist()[:remaining_needed]
                    top_recommendations.extend(top_featured[:remaining_needed])
                    remaining_needed -= len(top_featured)
            
            # If still need more, add newest properties
            if remaining_needed > 0:
                newest = remaining_properties.sort_values('created_at', ascending=False)['id'].tolist()[:remaining_needed]
                top_recommendations.extend(newest)
        
        print(f"Generated recommendations in {time.time() - start_time:.2f} seconds", file=sys.stderr)
        return top_recommendations
        
    except Exception as e:
        print(f"Error in get_recommendations_for_user: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return []

def test_engine():
    """Test function to verify the engine is working"""
    # Create test data
    test_properties = [
        {
            'id': 'prop1',
            'property_type': 'Apartment',
            'price': 100000,
            'area': 100,
            'bedrooms': 2,
            'bathrooms': 1,
            'governate': 'Beirut',
            'city': 'Downtown',
            'created_at': '2023-01-01T00:00:00Z',
            'is_featured': True
        },
        {
            'id': 'prop2',
            'property_type': 'Apartment',
            'price': 120000,
            'area': 110,
            'bedrooms': 2,
            'bathrooms': 1,
            'governate': 'Beirut',
            'city': 'Downtown',
            'created_at': '2023-01-02T00:00:00Z',
            'is_featured': False
        },
        {
            'id': 'prop3',
            'property_type': 'Villa',
            'price': 500000,
            'area': 300,
            'bedrooms': 4,
            'bathrooms': 3,
            'governate': 'Mount Lebanon',
            'city': 'Broumana',
            'created_at': '2023-01-03T00:00:00Z',
            'is_featured': False
        }
    ]
    
    # Test preprocessing
    df = preprocess_properties(test_properties)
    
    # Test feature matrix creation
    feature_matrix, _ = create_feature_matrix(df)
    
    # Test similar properties
    similar_ids = find_similar_properties('prop1', df, feature_matrix)
    
    # Test user recommendations
    user_history = [{'property_id': 'prop1'}]
    recommendations = get_recommendations_for_user(user_history, test_properties)
    
    return {
        'success': True,
        'message': 'All tests passed',
        'similar_to_prop1': similar_ids,
        'user_recommendations': recommendations
    }

def main():
    """Main function to handle CLI arguments"""
    print("Starting recommendation_engine.py", file=sys.stderr)
    start_time = time.time()
    
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)
    
    try:
        # Parse input data
        input_data = json.loads(sys.argv[1])
        
        mode = input_data.get('mode', 'user_recommendations')
        print(f"Mode: {mode}", file=sys.stderr)
        
        if mode == 'user_recommendations':
            user_history = input_data.get('user_history', [])
            all_properties = input_data.get('all_properties', [])
            limit = input_data.get('limit', 5)
            
            print(f"User history: {len(user_history)} items", file=sys.stderr)
            print(f"All properties: {len(all_properties)} items", file=sys.stderr)
            
            recommendations = get_recommendations_for_user(user_history, all_properties, limit)
            print(json.dumps({"success": True, "recommendations": recommendations}))
        
        elif mode == 'similar_properties':
            property_id = input_data.get('property_id')
            all_properties = input_data.get('all_properties', [])
            limit = input_data.get('limit', 5)
            
            df = preprocess_properties(all_properties)
            feature_matrix, _ = create_feature_matrix(df)
            similar_ids = find_similar_properties(property_id, df, feature_matrix, limit)
            
            print(json.dumps({"success": True, "similar_properties": similar_ids}))
        
        elif mode == 'test':
            test_result = test_engine()
            print(json.dumps(test_result))
            
        else:
            print(json.dumps({"error": f"Unknown mode: {mode}"}))
            sys.exit(1)
        
        print(f"Total execution time: {time.time() - start_time:.2f} seconds", file=sys.stderr)
            
    except Exception as e:
        error_details = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_details))
        sys.exit(1)

if __name__ == "__main__":
    main()