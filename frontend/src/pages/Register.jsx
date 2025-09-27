import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "../constants";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");            // NEW state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    try {
      // 1. Register user
      await api.post("/api/auth/register/", {
        username,
        email,                                       // send email
        password,
        confirm_password: confirmPassword,
      });

      // 2. Immediately login to get tokens
      const { data } = await api.post("/api/auth/login/", {
        username,
        password,
      });

      localStorage.setItem(ACCESS_TOKEN, data.access);
      localStorage.setItem(REFRESH_TOKEN, data.refresh);

      // 3. Redirect to dashboard
      navigate("/dashboard");
    } catch (err) {
      console.error("Registration failed:", err);
      if (err.response?.data) {
        setError(JSON.stringify(err.response.data));
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Register</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="email"                               // NEW email input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={styles.input}
          required
        />
        <button type="submit" style={styles.button}>
          Register
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      <span style={styles.loginText}>
        Already have an account?{" "}
        <Link to="/" style={styles.link}>
          Login Here
        </Link>
      </span>
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    maxWidth: "300px",
    margin: "100px auto",
    padding: "20px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    textAlign: "center",
    fontFamily: "sans-serif",
  },
  title: {
    marginBottom: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  input: {
    padding: "10px",
    borderRadius: "4px",
    border: "1px solid #aaa",
  },
  button: {
    padding: "10px",
    border: "none",
    borderRadius: "4px",
    backgroundColor: "#28a745",
    color: "#fff",
    cursor: "pointer",
  },
  loginText: {
    display: "block",
    marginTop: "15px",
  },
  link: {
    color: "#007bff",
    textDecoration: "none",
    fontWeight: "bold",
  },
  error: {
    color: "red",
    marginTop: "10px",
  },
};
