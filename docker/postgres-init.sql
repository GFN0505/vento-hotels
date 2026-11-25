-- Runs once, when the local Postgres volume is first created.
-- A separate database for automated tests, so tests never touch your development data.
CREATE DATABASE vento_hotels_test OWNER vento_hotels;
