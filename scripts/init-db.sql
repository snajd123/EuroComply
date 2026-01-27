-- Create test database for automated tests
-- This runs automatically when the postgres container is first created

CREATE DATABASE eurocomply_test;

-- Create app user with limited privileges (optional, for production-like setup)
-- CREATE USER eurocomply_app WITH PASSWORD 'eurocomply_app_password';
-- GRANT CONNECT ON DATABASE eurocomply TO eurocomply_app;
-- GRANT CONNECT ON DATABASE eurocomply_test TO eurocomply_app;
