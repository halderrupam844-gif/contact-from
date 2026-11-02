(() => {
  const form = document.querySelector("#donation-form");
  const amountInput = document.querySelector("#donation-custom-amount");
  const status = document.querySelector("#donation-status");
  const button = document.querySelector("#donate-button");
  const backButton = document.querySelector("#back-to-contact");
  const presets = [...document.querySelectorAll("[data-donation-amount]")];
  const config = window.SUPABASE_CONFIG || {};
  const endpoint = config.url ? `${config.url}/functions/v1/razorpay-test` : "";

  function showStatus(type, message) {
    status.className = `form-status ${type}`;
    status.textContent = message;
  }

  backButton.addEventListener("click", () => {
    document.querySelector("#donation-step").hidden = true;
    document.querySelector("#contact-step").hidden = false;
    document.querySelector(".privacy-note").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function selectedAmount() {
    const selected = document.querySelector('input[name="donation-amount"]:checked');
    const rupees = selected?.value === "custom"
      ? Number(amountInput.value)
      : Number(selected?.value);
    if (!Number.isInteger(rupees) || rupees < 10 || rupees > 5000) return null;
    return rupees * 100;
  }

  presets.forEach((radio) => {
    radio.addEventListener("change", () => {
      amountInput.disabled = radio.value !== "custom";
      if (radio.value === "custom") amountInput.focus();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus("", "");
    const amount = selectedAmount();
    if (!amount) {
      showStatus("error", "Choose an amount from ₹10 to ₹5,000.");
      return;
    }
    if (!window.Razorpay || !config.publishableKey || !endpoint) {
      showStatus("error", "The test payment demo is not configured yet.");
      return;
    }

    button.disabled = true;
    button.textContent = "Preparing test checkout…";
    try {
      const orderResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey
        },
        body: JSON.stringify({ action: "create-order", amount })
      });
      const orderData = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderData.error || "Could not create a test order.");

      const checkout = new Razorpay({
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Donation Demo",
        description: "Test-mode donation — no real money",
        order_id: orderData.order.id,
        handler: async (response) => {
          try {
            const verifyResponse = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: config.publishableKey
              },
              body: JSON.stringify({
                action: "verify-payment",
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            const verification = await verifyResponse.json();
            if (!verifyResponse.ok || !verification.verified) {
              throw new Error(verification.error || "The test payment could not be verified.");
            }
            showStatus("success", `Test payment verified: ₹${(verification.amount / 100).toFixed(2)}. No real money was moved.`);
          } catch (error) {
            showStatus("error", error.message || "Verification failed. Please try again.");
          } finally {
            button.disabled = false;
            button.textContent = "Continue to test checkout";
          }
        },
        modal: {
          ondismiss: () => {
            showStatus("", "Test checkout closed. No payment was confirmed.");
            button.disabled = false;
            button.textContent = "Continue to test checkout";
          }
        },
        theme: { color: "#5665e8" }
      });
      checkout.on("payment.failed", () => {
        showStatus("error", "Test payment failed. No donation was recorded.");
        button.disabled = false;
        button.textContent = "Continue to test checkout";
      });
      checkout.open();
    } catch (error) {
      showStatus("error", error.message || "Unable to start test checkout.");
      button.disabled = false;
      button.textContent = "Continue to test checkout";
    }
  });
})();
