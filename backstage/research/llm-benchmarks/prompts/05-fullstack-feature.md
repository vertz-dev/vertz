# Task 5: Build a Full-Stack Feature

## Objective

Build a complete feature including API, client-side code, and UI.

## Requirements

### Feature: Comment System

A blog post can have comments. Users can add comments to posts.

**API Endpoints**
- `GET /posts/:postId/comments` — List comments for a post
- `POST /posts/:postId/comments` — Add a comment (authenticated)
- `DELETE /comments/:id` — Delete own comment

**Data Model**
- Comment: id, postId, userId, content, createdAt

**Client**
- Fetch and display comments for a post
- Form to submit new comment (when logged in)
- Show "login to comment" when not authenticated

**UI**
- List of comments with user name and timestamp
- Comment form (conditional on auth)
- Loading and error states

## Deliverable

Implement:
1. API endpoints for comments
2. Client-side code to fetch/submit comments
3. UI component to display and add comments

## Success Criteria

- [ ] API endpoints work correctly
- [ ] Client fetches comments from API
- [ ] UI displays comments with user info
- [ ] Authenticated users can add comments
- [ ] Unauthenticated users see "login to comment"
- [ ] Code compiles without errors
