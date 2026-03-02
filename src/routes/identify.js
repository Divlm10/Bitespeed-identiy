const express = require('express');
const router = express.Router();
const pool = require('../db');
console.log("DATABASE_URL:", process.env.DATABASE_URL);

router.post('/', async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({
      error: "email or phoneNumber required"
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM contacts
       WHERE email = $1 OR phoneNumber = $2
       ORDER BY createdAt ASC`,
      [email || null, phoneNumber || null]
    );

    const matches = result.rows;

    if (matches.length === 0) {
      const newContact = await client.query(
        `INSERT INTO contacts (email, phoneNumber, linkPrecedence)
         VALUES ($1, $2, 'primary')
         RETURNING *`,
        [email || null, phoneNumber || null]
      );

      await client.query('COMMIT');

      return res.json({
        contact: {
          primaryContactId: newContact.rows[0].id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: []
        }
      });
    }

    const involvedPrimaries = [];

    for (const contact of matches) {
      if (contact.linkprecedence === 'primary') {
        involvedPrimaries.push(contact);
      } else {
        const primaryResult = await client.query(
          `SELECT * FROM contacts WHERE id = $1`,
          [contact.linkedid]
        );
        involvedPrimaries.push(primaryResult.rows[0]);
      }
    }

    // Remove duplicate primaries
    const uniquePrimaries = [
      ...new Map(involvedPrimaries.map(p => [p.id, p])).values()
    ];

    // Sort by oldest createdAt
    uniquePrimaries.sort(
      (a, b) => new Date(a.createdat) - new Date(b.createdat)
    );

    // Oldest becomes final primary
    const primary = uniquePrimaries[0];


    for (let i = 1; i < uniquePrimaries.length; i++) {
      const secondaryPrimary = uniquePrimaries[i];

      // Convert old primary → secondary
      await client.query(
        `UPDATE contacts
         SET linkPrecedence = 'secondary',
             linkedId = $1,
             updatedAt = now()
         WHERE id = $2`,
        [primary.id, secondaryPrimary.id]
      );

      // Update its linked contacts
      await client.query(
        `UPDATE contacts
         SET linkedId = $1,
             updatedAt = now()
         WHERE linkedId = $2`,
        [primary.id, secondaryPrimary.id]
      );
    }

    const clusterResult = await client.query(
      `SELECT * FROM contacts
       WHERE id = $1 OR linkedId = $1
       ORDER BY createdAt ASC`,
      [primary.id]
    );

    let cluster = clusterResult.rows;


    const exactMatch = cluster.find(
      c =>
        (c.email === email || (!c.email && !email)) &&
        (c.phonenumber === phoneNumber || (!c.phonenumber && !phoneNumber))
    );

    // If not exact match → create secondary
    if (!exactMatch) {
      await client.query(
        `INSERT INTO contacts (email, phoneNumber, linkedId, linkPrecedence)
         VALUES ($1, $2, $3, 'secondary')`,
        [email || null, phoneNumber || null, primary.id]
      );

      
      const updatedCluster = await client.query(
        `SELECT * FROM contacts
         WHERE id = $1 OR linkedId = $1
         ORDER BY createdAt ASC`,
        [primary.id]
      );

      cluster = updatedCluster.rows;
    }

    await client.query('COMMIT');


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
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
});

module.exports = router;