# Bitespeed Identity Service

Node.js + Express + PostgreSQL service to consolidate customer contacts.

## Endpoint

POST /identify

Body:
{
  "email": "string",
  "phoneNumber": "string"
}