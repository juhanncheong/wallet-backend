// LOGIN FUNCTION
function loginUser(event) {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  fetch("http://localhost:5000/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.token) {
        localStorage.setItem("token", data.token);
        alert("✅ Login successful!");
        // Optional: redirect to dashboard
        window.location.href = "dashboard.html";
      } else {
        alert(data.message || "❌ Login failed.");
      }
    })
    .catch(err => {
      console.error("Login error:", err);
      alert("❌ An error occurred.");
    });
}

// REGISTER FUNCTION
function registerUser(event) {
  const username = document.getElementById("register-username").value;
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;

  fetch("http://localhost:5000/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.message.toLowerCase().includes("success")) {
        window.location.href = "index.html"; // Redirect to login
      }
    })
    .catch(err => {
      console.error("Register error:", err);
      alert("❌ Registration failed.");
    });
}
