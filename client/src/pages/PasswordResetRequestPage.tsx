import React, { useState } from 'react';
import axios from 'axios';

const PasswordResetRequestPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/auth/password/reset/request', {
        email,
      });

      setMessage('Password reset link sent to your email address.');
      setError('');
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to request password reset.');
      setMessage('');
    }
  };

  return (
    <div>
      <h2>Request Password Reset</h2>
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
        <button type="submit">Request Reset</button>
      </form>
    </div>
  );
};

export default PasswordResetRequestPage;
