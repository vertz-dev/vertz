# Task 7: Set Up a Multi-Service Architecture

## Objective

Design and implement a multi-service architecture with service-to-service communication.

## Requirements

### Services

**User Service**
- Manages users and authentication
- Port: 3001
- Endpoints: /auth/login, /auth/register, /users/me

**Order Service**
- Manages orders
- Port: 3002
- Endpoints: /orders, /orders/:id
- Requires user info from User Service

**Notification Service**
- Sends notifications (email placeholder)
- Port: 3003
- Accepts notifications from other services

### Architecture

- User Service is the source of truth for user data
- Order Service fetches user data from User Service
- Order Service sends notifications to Notification Service on order creation
- Services communicate via HTTP

### Implementation

1. Set up three separate services
2. Implement inter-service communication
3. Handle service unavailability gracefully
4. Add service health checks

## Deliverable

Implement:
1. User Service with auth
2. Order Service that calls User Service
3. Notification Service that receives events
4. Proper error handling for service failures

## Success Criteria

- [ ] Three services run independently
- [ ] Order Service can fetch user data from User Service
- [ ] Notification Service receives events from Order Service
- [ ] Proper error handling when services are unavailable
- [ ] Code compiles without errors
