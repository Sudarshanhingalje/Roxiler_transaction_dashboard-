const express = require("express");
const cors = require("cors");
const { Sequelize, DataTypes } = require("sequelize");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection configuration
const sequelize = new Sequelize('transaction_database', 'root', 'Sudu@1308', {
  host: 'localhost',
  dialect: 'mysql'
});

// Define the Transaction model
const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: DataTypes.STRING,
  price: DataTypes.FLOAT,
  description: DataTypes.TEXT,
  category: DataTypes.STRING,
  image: DataTypes.STRING,
  sold: DataTypes.BOOLEAN,
  dateOfSale: DataTypes.DATE
});

// Initialize database and seed data
async function initializeDatabase() {
  try {
    // Sync database
    await sequelize.sync({ force: true });
    console.log('Database synchronized');

    // Fetch seed data from API
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const seedData = response.data;

    // Insert seed data
    await Transaction.bulkCreate(seedData);
    console.log('Seed data inserted successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Routes

// Get all transactions with optional month filter
app.get('/api/transactions', async (req, res) => {
  try {
    const { month } = req.query;
    let whereClause = {};
    
    if (month) {
      whereClause = sequelize.where(
        sequelize.fn('MONTH', sequelize.col('dateOfSale')),
        parseInt(month)
      );
    }

    const transactions = await Transaction.findAll({
      where: whereClause
    });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistics API
app.get('/api/statistics', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const monthWhereClause = sequelize.where(
      sequelize.fn('MONTH', sequelize.col('dateOfSale')),
      parseInt(month)
    );

    const totalSaleAmount = await Transaction.sum('price', {
      where: {
        sold: true,
        ...monthWhereClause
      }
    });

    const totalSoldItems = await Transaction.count({
      where: {
        sold: true,
        ...monthWhereClause
      }
    });

    const totalNotSoldItems = await Transaction.count({
      where: {
        sold: false,
        ...monthWhereClause
      }
    });

    res.json({
      totalSaleAmount: totalSaleAmount || 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bar Chart API
app.get('/api/bar-chart', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const priceRanges = [
      { min: 0, max: 100 },
      { min: 101, max: 200 },
      { min: 201, max: 300 },
      { min: 301, max: 400 },
      { min: 401, max: 500 },
      { min: 501, max: 600 },
      { min: 601, max: 700 },
      { min: 701, max: 800 },
      { min: 801, max: 900 },
      { min: 901, max: Number.MAX_SAFE_INTEGER }
    ];

    const monthWhereClause = sequelize.where(
      sequelize.fn('MONTH', sequelize.col('dateOfSale')),
      parseInt(month)
    );

    const results = await Promise.all(priceRanges.map(async range => {
      const count = await Transaction.count({
        where: {
          price: {
            [Sequelize.Op.gte]: range.min,
            [Sequelize.Op.lte]: range.max
          },
          ...monthWhereClause
        }
      });
      return {
        range: `${range.min}-${range.max === Number.MAX_SAFE_INTEGER ? 'above' : range.max}`,
        count
      };
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pie Chart API
app.get('/api/pie-chart', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const monthWhereClause = sequelize.where(
      sequelize.fn('MONTH', sequelize.col('dateOfSale')),
      parseInt(month)
    );

    const categories = await Transaction.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('category')), 'count']
      ],
      where: monthWhereClause,
      group: 'category'
    });

    res.json(categories.map(cat => ({
      category: cat.category,
      count: cat.getDataValue('count')
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Combined API
app.get('/api/combined-data', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }

    const [statistics, barChart, pieChart] = await Promise.all([
      axios.get(`http://localhost:${port}/api/statistics?month=${month}`),
      axios.get(`http://localhost:${port}/api/bar-chart?month=${month}`),
      axios.get(`http://localhost:${port}/api/pie-chart?month=${month}`)
    ]);

    res.json({
      statistics: statistics.data,
      barChart: barChart.data,
      pieChart: pieChart.data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await initializeDatabase();
});