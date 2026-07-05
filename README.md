# Eskan Real Estate Backend API

A production-ready Node.js and Express backend for the Eskan real estate platform. The service powers property discovery, user authentication, agent management, chat, notifications, and content workflows using MongoDB as the primary data store and JWT for secure API access.

## Overview

This backend provides the core business logic and API layer for the platform, including:

- User registration, login, and JWT-based session handling
- Property creation, updates, search, and listing management
- Agent profiles and agent-facing workflows
- Favorites, inquiries, testimonials, and contact submissions
- Messaging and notification services
- Admin-specific management endpoints

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT authentication
- Cloudinary for image and media uploads
- WebSocket support for real-time chat and notifications
- Docker support for containerized deployment

## Architecture Notes

- Authentication is handled through JWT bearer tokens issued by the backend.
- Persistent application data is stored in MongoDB rather than a Supabase-backed database.
- Media uploads are processed through Cloudinary and referenced by the application.
- The backend is designed to serve both the web and mobile clients through a single API layer.

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
NODE_ENV=development
PORT=3001

MONGO_URI=mongodb://localhost:27017/eskan
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

FRONTEND_URL=http://localhost:3000
```

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your `.env` file with the required variables.
3. Start the development server:
   ```bash
   npm run dev
   ```

## API Highlights

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate a user and return a JWT
- `GET /api/auth/verify` - Verify the current access token

### Properties
- `GET /api/properties` - Retrieve property listings
- `POST /api/properties` - Create or update a property
- `GET /api/properties/:id` - Fetch a single property

### Agents and Content
- `GET /api/agents` - Retrieve agent listings
- `GET /api/agents/featured` - Get featured agents
- `GET /api/blogs` - Fetch published blog posts

## Deployment

The project is prepared for deployment on Render and includes a deployment configuration in `render.yaml`.

## License

MIT
