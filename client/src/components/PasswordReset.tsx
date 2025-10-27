import React, { useState } from 'react';
import axios from 'axios';

const PasswordReset: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    try {
      await axios.post('/api/password-reset', { email }); // Replace with your API endpoint
      setMessage('Password reset link sent to your email address.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to request password reset.');
    }
  };

  return (
    <div>
      <h2>Password Reset</h2>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button type="submit">Request Password Reset</button>
      </form>
    </div>
  );
};

export default PasswordReset;
