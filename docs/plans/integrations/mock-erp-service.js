import express from 'express';
const app = express();
const PORT = 4004;

app.use(express.json());

// Logger middleware per monitorare i payload inviati da Whoobe
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    console.log('Payload Ricevuto:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Database temporaneo in memoria per i test CRUD
let mockInventory = [
  {
    sku: "WH-901-XL",
    name: "Enterprise Wireless Router Pro",
    category: "Hardware/Networking",
    pricing: { base_price: 299.99, currency: "EUR", vat_rate: 22 },
    logistics: {
      total_stock: 142,
      warehouses: [
        { id: "WH-MILANO", zone: "A3", available: 85 },
        { id: "WH-ROMA", zone: "B1", available: 57 }
      ]
    },
    metadata: { manufacturer: "Cisco Systems", ean: "8012345678901", active: true }
  },
  {
    sku: "WH-402-MED",
    name: "Smart IoT Gateway Hub",
    category: "Hardware/IoT",
    pricing: { base_price: 149.50, currency: "EUR", vat_rate: 22 },
    logistics: {
      total_stock: 19,
      warehouses: [
        { id: "WH-MILANO", zone: "A5", available: 19 }
      ]
    },
    metadata: { manufacturer: "Whoobe Labs", ean: "8012345678902", active: true }
  }
];

let mockOrders = [];

// ==========================================
// 🌐 1. OPERAZIONI DI LETTURA (GET)
// Perfette per testare l'Auto-Schema Detection di Whoobe
// ==========================================

// Endpoint OpenAPI Spec simulato (Se il gateway di Whoobe tenta di leggerlo)
app.get('/api/v1/schema-spec', (req, res) => {
  res.json({
    platform: "Mock ERP Enterprise",
    version: "3.4.1-beta",
    endpoints: ["/api/v1/products", "/api/v1/products/:sku", "/api/v1/orders"]
  });
});

// GET di tutti i prodotti (Ritorna una struttura complessa/annidata)
app.get('/api/v1/products', (req, res) => {
  res.json({
    status: "success",
    count: mockInventory.length,
    data: mockInventory
  });
});

// GET Prodotto singolo per SKU (Ideale per testare il binding dinamico via URL path come /products/{slug})
app.get('/api/v1/products/:sku', (req, res) => {
  const product = mockInventory.find(p => p.sku === req.params.sku);
  if (!product) {
    return res.status(404).json({ error: "Product not found", requested_sku: req.params.sku });
  }
  res.json(product);
});


// ==========================================
// ✍️ 2. OPERAZIONI DI SCRITTURA (POST, PUT, PATCH)
// Per testare l'invio dei Form di Whoobe e la coda offline di Capacitor
// ==========================================

// POST: Creazione nuovo ordine (Simula l'invio di un form di acquisto o lead)
app.post('/api/v1/orders', (req, res) => {
  const { customer_id, items, shipping_address } = req.body;

  // Validazione minima di sicurezza del mock
  if (!customer_id || !items || !Array.isArray(items)) {
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "I campi 'customer_id' e 'items' (array) sono obbligatori." 
    });
  }

  const newOrder = {
    order_id: `ERP-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
    customer_id,
    items,
    shipping_address: shipping_address || {},
    status: "PROCESSING",
    created_at: new Date().toISOString()
  };

  mockOrders.push(newOrder);

  // Simula un ritardo di rete di 1 secondo per testare lo stato "loading" della UI di Whoobe
  setTimeout(() => {
    res.status(201).json({
      success: true,
      message: "Ordine registrato con successo nel sistema ERP.",
      order: newOrder
    });
  }, 1000);
});

// PUT: Aggiornamento completo dello stock (Simula operazione di backoffice)
app.put('/api/v1/products/:sku/stock', (req, res) => {
  const { total_stock, warehouses } = req.body;
  const productIndex = mockInventory.findIndex(p => p.sku === req.params.sku);

  if (productIndex === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (total_stock === undefined) {
    return res.status(400).json({ error: "Missing total_stock field" });
  }

  mockInventory[productIndex].logistics.total_stock = total_stock;
  if (warehouses) mockInventory[productIndex].logistics.warehouses = warehouses;

  res.json({
    success: true,
    message: `Stock aggiornato per SKU ${req.params.sku}`,
    updated_logistics: mockInventory[productIndex].logistics
  });
});

// PATCH: Aggiornamento parziale dei metadati (Es. disattivare un prodotto)
app.patch('/api/v1/products/:sku', (req, res) => {
  const product = mockInventory.find(p => p.sku === req.params.sku);
  if (!product) return res.status(404).json({ error: "Product not found" });

  if (req.body.active !== undefined) product.metadata.active = req.body.active;
  if (req.body.name) product.name = req.body.name;

  res.json({
    success: true,
    message: `Prodotto ${req.params.sku} patchato con successo.`,
    data: product
  });
});

// Avvio del Server
app.listen(PORT, () => {
  console.log(`\n⚙️  Mock ERP in esecuzione sulla porta ${PORT}`);
  console.log(`🔗 Endpoint di test per l'Auto-Schema Detection (GET): http://localhost:${PORT}/api/v1/products/WH-901-XL`);
  console.log(`📥 Endpoint di test per l'invio Form (POST): http://localhost:${PORT}/api/v1/orders\n`);
});
