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

    const matches = result.rows;
    //no matched
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

    // Oldest becomes primary
    const primary = matches[0];

    // Fetch full cluster
    const clusterResult = await pool.query(
      `SELECT * FROM contacts
       WHERE id = $1 OR linkedId = $1
       ORDER BY createdAt ASC`,
      [primary.id]
    );

    let cluster = clusterResult.rows;

    // Check if exact row exists
    const exactMatch = cluster.find(
      c =>
        (c.email === email || (!c.email && !email)) &&
        (c.phonenumber === phoneNumber || (!c.phonenumber && !phoneNumber))
    );

    // If no exact match → create secondary
    if (!exactMatch) {
      await pool.query(
        `INSERT INTO contacts (email, phoneNumber, linkedId, linkPrecedence)
         VALUES ($1, $2, $3, 'secondary')`,
        [email || null, phoneNumber || null, primary.id]
      );

      // Re-fetch cluster
      const updatedCluster = await pool.query(
        `SELECT * FROM contacts
         WHERE id = $1 OR linkedId = $1
         ORDER BY createdAt ASC`,
        [primary.id]
      );

      cluster = updatedCluster.rows;
    }

    // Build response
    const emails = [
      ...new Set(cluster.map(c => c.email).filter(Boolean))
    ];

    const phoneNumbers = [
      ...new Set(cluster.map(c => c.phonenumber).filter(Boolean))
    ];

    const secondaryContactIds = cluster
      .filter(c => c.linkprecedence === 'secondary')
      .map(c => c.id);

    return res.json({
      contact: {
        primaryContactId: primary.id,
        emails,
        phoneNumbers,
        secondaryContactIds
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;