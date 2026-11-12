(() => {
  const form = document.querySelector("#contact-form");
  const submitButton = document.querySelector("#submit-button");
  const buttonLabel = document.querySelector("#button-label");
  const status = document.querySelector("#form-status");
  const message = form.elements.message;
  const charCount = document.querySelector("#char-count");

  message.addEventListener("input", () => {
    charCount.textContent = `${message.value.length} / 5000`;
  });

  function showStatus(type, text) {
    status.className = `form-status ${type}`;
    status.textContent = text;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus("", "");

    const config = window.SUPABASE_CONFIG || {};
    if (!config.url || !config.publishableKey) {
      showStatus("error", "Supabase setup is incomplete. Check config.js.");
      return;
    }

    const data = new FormData(form);
    // Basic honeypot anti-spam measure; not a complete spam defense.
    if (String(data.get("website") || "").trim()) {
      showStatus("success", "Thanks! Your message has been submitted.");
      form.reset();
      charCount.textContent = "0 / 5000";
      return;
    }

    const contact = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim() || null,
      subject: String(data.get("subject") || "").trim(),
      message: String(data.get("message") || "").trim()
    };

    if (
      contact.name.length < 1 || contact.name.length > 100 ||
      contact.email.length < 3 || contact.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ||
      contact.subject.length < 1 || contact.subject.length > 200 ||
      contact.message.length < 1 || contact.message.length > 5000 ||
      (contact.phone && contact.phone.length > 30)
    ) {
      showStatus("error", "Please check the form fields and try again.");
      return;
    }

    submitButton.disabled = true;
    buttonLabel.textContent = "Sending…";
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/contact-auto-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.publishableKey,
          "Authorization": `Bearer ${config.publishableKey}`
        },
        body: JSON.stringify(contact)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.submitted) {
        const messageText = response.status === 429
          ? "Too many messages were sent from this network. Please wait a while and try again."
          : "We couldn't send your message. Please try again later.";
        showStatus("error", messageText);
        return;
      }
      form.reset();
      charCount.textContent = "0 / 5000";
      showStatus("success", result.autoReplySent
        ? "Your message has been sent successfully. A confirmation email is on its way."
        : "Your message has been received successfully. We couldn't send the confirmation email this time.");
    } catch (error) {
      console.error("Contact form error:", error);
      showStatus("error", "A connection issue occurred. Please check your internet and try again.");
    } finally {
      submitButton.disabled = false;
      buttonLabel.textContent = "Send message";
    }
  });
})();
