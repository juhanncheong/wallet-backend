import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate(); // ✅

  const handleLogin = async () => {
    try {
      const res = await fetch("https://wallet-backend-pkxi.onrender.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("token", data.token);
        navigate("/users"); // ✅ redirect after login
      } else {
        alert("Invalid credentials");
      }
    } catch (error) {
      alert("Error logging in");
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      <div className="w-1/2 hidden md:flex items-center justify-center bg-white">
        <img
          src="https://i.pinimg.com/736x/6c/5e/79/6c5e79cd2a84b42de22991bfd6dc22f4.jpg"
          alt="Admin Login"
          className="w-3/4 object-contain"
        />
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-xl p-10 w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Admin Login</h2>

          <input
            type="text"
            placeholder="Username"
            className="w-full px-4 py-2 border rounded-md mb-4"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border rounded-md mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md"
          >
            Log In
          </button>

          <p className="text-sm text-center mt-4 text-gray-500">
            Forgot password? Contact admin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
