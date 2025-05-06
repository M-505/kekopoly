import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to wallet connect page if not authenticated
    return <Navigate to="/connect" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute; 