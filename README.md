## Live Endpoint

POST https://bitespeed-identiy.onrender.com/identify

### Example Request

{
  "email": "test@test.com",
  "phoneNumber": "123456"
}

### Example Response

{
  "contact": {
    "primaryContactId": 1,
    "emails": ["test@test.com"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}