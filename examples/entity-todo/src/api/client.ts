/**
 * API client for the Entity Todo demo.
 *
 * In a real app, this would import the generated SDK from src/generated/
 * and instantiate it with a FetchClient. Here we re-export the mock
 * data functions for use during development and testing.
 */

export { todoApi, fetchTodos, fetchTodo, createTodo, updateTodo, deleteTodo } from './mock-data';
