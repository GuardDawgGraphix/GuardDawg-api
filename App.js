
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "Guard Dawg Graphix API running" });
});

app.post("/api/checkout", async (req, res) => {
  try {
    const { items, customerEmail } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "No items" });

    const lineItems = items.map((item) => {
      if (item.stripe_price_id) {
        return { price: item.stripe_price_id, quantity: item.quantity || 1 };
      }
      return {
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: Math.round(parseFloat(item.price) * 100),
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_email: customerEmail || undefined,
      success_url: `${process.env.SITE_URL || "https://guarddawggraphix.com"}/order-status?success=1`,
      cancel_url: `${process.env.SITE_URL || "https://guarddawggraphix.com"}/cart`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { amount, customerEmail, customerName, description } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount required" });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      receipt_email: customerEmail || undefined,
      description: description || "Guard Dawg Graphix order",
      metadata: { customer_name: customerName || "", customer_email: customerEmail || "" },
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error("Payment intent error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync-product", async (req, res) => {
  try {
    const { id, name, description, price, stripe_product_id } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Missing fields" });

    let product;
    if (stripe_product_id) {
      product = await stripe.products.update(stripe_product_id, { name, description: description || "" });
    } else {
      product = await stripe.products.create({ name, description: description || "", metadata: { pb_id: id } });
    }

    const priceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(parseFloat(price) * 100),
      currency: "usd",
    });

    res.json({ stripe_product_id: product.id, stripe_price_id: priceObj.id });
  } catch (err) {
    console.error("Sync product error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/archive-product", async (req, res) => {
  try {
    const { stripe_product_id } = req.body;
    if (!stripe_product_id) return res.status(400).json({ error: "Missing stripe_product_id" });
    await stripe.products.update(stripe_product_id, { active: false });
    res.json({ success: true });
  } catch (err) {
    console.error("Archive product error:", err);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(port, () => console.log(`Guard Dawg Graphix API listening on port ${port}`));
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;
