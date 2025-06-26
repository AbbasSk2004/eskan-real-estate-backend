# Eskan Real Estate Backend API

This is the backend API for the Eskan Real Estate application. It provides endpoints for property management, user authentication, and real estate agent services.

## Features

- User authentication with Supabase
- Property listing and management
- Real estate agent profiles
- File uploads with Supabase Storage
- Chat functionality
- Property inquiries and favorites
- Testimonials and contact forms

## Tech Stack

- Node.js
- Express.js
- Supabase (Database & Authentication)
- Docker support
- JWT Authentication
- File Upload handling

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Services
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_REDIRECT_URI=your_google_redirect_uri

# API Configuration
PORT=3001
NODE_ENV=development
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file with your configuration
4. Start the development server:
   ```bash
   npm run dev
   ```

## API Documentation

### Authentication Endpoints
- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/verify` - Verify authentication token

### Property Endpoints
- GET `/api/properties` - Get all properties
- POST `/api/properties` - Create a new property
- GET `/api/properties/:id` - Get property by ID

### Agent Endpoints
- GET `/api/agents` - Get all agents
- GET `/api/agents/featured` - Get featured agents
- GET `/api/agents/:id` - Get agent by ID

## Deployment

This application is configured for deployment on Render.com. The `render.yaml` file contains the necessary configuration.

## License

MIT 