const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/', async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({
      error: "email or phoneNumber required"
    });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM contacts
       WHERE email = $1 OR phoneNumber = $2
       ORDER BY createdAt ASC`,
      [email || null, phoneNumber || null]
    );
    const matches=result.rows;

    // return res.json({matches});//test
    if (matches.length === 0) {
    const newContact = await pool.query(
        `INSERT INTO contacts (email, phoneNumber, linkPrecedence)
        VALUES ($1, $2, 'primary')
        RETURNING *`,
        [email || null, phoneNumber || null]
    );

    return res.json({
        contact: {
        primaryContactId: newContact.rows[0].id,
        emails: email ? [email] : [],
        phoneNumbers: phoneNumber ? [phoneNumber] : [],
        secondaryContactIds: []
        }
    });
}

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;