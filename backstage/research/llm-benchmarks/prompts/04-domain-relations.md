# Task 4: Create a Domain with Relations

## Objective

Create a domain model with relational data (entities with relationships).

## Requirements

### Entities

**Author**
- `id`: UUID
- `name`: string
- `email`: string (unique)

**Book**
- `id`: UUID
- `title`: string
- `publishedYear`: number
- `authorId`: UUID (foreign key to Author)

**Review**
- `id`: UUID
- `rating`: number (1-5)
- `comment`: string
- `bookId`: UUID (foreign key to Book)
- `reviewerId`: UUID (foreign key to Author)

### Relationships
- Author has many Books (one-to-many)
- Book has many Reviews (one-to-many)
- Author has many Reviews (one-to-many, as reviewer)
- Book belongs to Author

### Operations
- Create author with books
- Get author with all their books
- Get book with author and reviews
- Add review to a book

## Deliverable

Implement the domain model with:
1. Entity definitions with proper relations
2. CRUD operations respecting relationships
3. Queries that fetch related data (eager loading)

## Success Criteria

- [ ] All entities defined with relationships
- [ ] One-to-many relationships work correctly
- [ ] Can fetch related data (author + books, book + reviews)
- [ ] Code compiles without errors
