import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
} from '@chakra-ui/react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import GameBoard from './components/game/GameBoard';
import GameLobby from './components/lobby/GameLobby';
import GameRoom from './components/lobby/GameRoom';
import WalletConnect from './components/auth/WalletConnect';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { store } from './store/store';
import { setGameStarted, setGamePhase, syncGameStatus } from './store/gameSlice';
import { clearGameStorageData } from './utils/storageUtils';

function App() {
  const gameState = useSelector((state) => state.game);
  const { gameStarted, gamePhase } = gameState;
  const { isAuthenticated } = useSelector((state) => state.auth);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Check localStorage for game state on component mount
  useEffect(() => {
    try {
      const storedGameStarted = localStorage.getItem('kekopoly_game_started') === 'true';
      const storedGameId = localStorage.getItem('kekopoly_game_id');
      const forceRedirect = localStorage.getItem('kekopoly_force_redirect') === 'true';
      const navTimestamp = localStorage.getItem('kekopoly_navigation_timestamp');

      console.log('[APP] Checking localStorage for game state:', {
        storedGameStarted,
        storedGameId,
        forceRedirect,
        navTimestamp,
        currentPath: location.pathname
      });

      // Only use localStorage data if timestamp is recent (last 2 minutes)
      // Increased from 30 seconds to 2 minutes to prevent unnecessary clearing
      const isTimestampRecent = navTimestamp &&
        (Date.now() - parseInt(navTimestamp, 10) < 120000);

      if (storedGameStarted && storedGameId && isTimestampRecent) {
        console.log('[APP] Found recent game state in localStorage');

        // Before navigating, verify the game exists by making an API call
        const verifyGameExists = async () => {
          try {
            // Get the auth token from localStorage
            const token = localStorage.getItem('kekopoly_token');
            if (!token) {
              console.warn('[APP] No auth token found, cannot verify game exists');
              return false;
            }

            // Make an API call to verify the game exists
            const response = await fetch(`/api/games/${storedGameId}`, {
              headers: {
                'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
              }
            });

            if (!response.ok) {
              console.warn(`[APP] Game ${storedGameId} does not exist or cannot be accessed`);

              // Clear the localStorage data for this non-existent game
              clearGameStorageData(storedGameId);

              return false;
            }

            // Game exists, proceed with navigation
            return true;
          } catch (error) {
            console.error('[APP] Error verifying game exists:', error);
            return false;
          }
        };

        // Update Redux state
        dispatch(setGameStarted(true));
        dispatch(setGamePhase('playing'));
        dispatch(syncGameStatus('PLAYING'));

        // If we're not already on the game page and forceRedirect is set
        if (!location.pathname.includes('/game/') && (forceRedirect || !location.pathname.includes('/room/'))) {
          console.log(`[APP] Checking if game ${storedGameId} exists before navigation`);

          // Clear the force redirect flag
          localStorage.removeItem('kekopoly_force_redirect');

          // Verify the game exists before navigating
          verifyGameExists().then(gameExists => {
            if (gameExists) {
              console.log(`[APP] Game ${storedGameId} exists, navigating`);
              // Navigate to the game
              navigate(`/game/${storedGameId}`);
            } else {
              console.warn(`[APP] Game ${storedGameId} does not exist, not navigating`);
              // If on home page, stay there; otherwise navigate to home
              if (location.pathname !== '/') {
                navigate('/');
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('[APP] Error checking localStorage:', e);
    }
  }, [navigate, dispatch, location.pathname]);

  // Log game state for debugging
  console.log('App.jsx - Current game state:', { gameStarted, gamePhase });

  // Get the previous location if redirected from protected route
  const from = location.state?.from?.pathname || '/';

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/connect" element={
        isAuthenticated ? <Navigate to={from} replace /> : <WalletConnect />
      } />

      {/* Protected Routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <GameLobby />
        </ProtectedRoute>
      } />

      <Route path="/room/:roomId" element={
        <ProtectedRoute>
          <GameRoom />
        </ProtectedRoute>
      } />

      <Route path="/game/:gameId" element={
        <ProtectedRoute>
          {console.log('[ROUTING] Game route accessed, gameStarted:', gameStarted, 'gamePhase:', gamePhase)}
          {/* Force re-evaluation of game state from Redux store */}
          {(() => {
            // Get the latest state directly from the store
            const latestState = store.getState().game;
            console.log('[ROUTING] Latest Redux game state:', latestState);

            // Use multiple indicators to determine if game is active
            const effectiveGameStarted = gameStarted || latestState.gameStarted;
            const effectiveGamePhase = gamePhase || latestState.gamePhase;

            // Also check localStorage as additional fallback
            let localStorageGameStarted = false;
            let storedGameId = null;
            let navTimestamp = null;

            try {
              localStorageGameStarted = localStorage.getItem('kekopoly_game_started') === 'true';
              storedGameId = localStorage.getItem('kekopoly_game_id');
              navTimestamp = localStorage.getItem('kekopoly_navigation_timestamp');

              // Only consider localStorage data if it's recent (last 2 minutes)
              // Increased from 30 seconds to 2 minutes to prevent unnecessary clearing
              const isTimestampRecent = navTimestamp &&
                (Date.now() - parseInt(navTimestamp, 10) < 120000);

              if (!isTimestampRecent) {
                console.log('[ROUTING] Stored game data is older than 2 minutes, but still usable');
                // Don't clear localStorage data automatically, just mark it as not recently updated
                // This prevents unnecessary clearing that causes re-renders
                localStorageGameStarted = localStorageGameStarted && storedGameId === window.location.pathname.split('/').pop();
              }
            } catch (e) {
              console.warn('[ROUTING] Error reading localStorage:', e);
            }

            console.log('[ROUTING] Effective game state:', {
              effectiveGameStarted,
              effectiveGamePhase,
              localStorageGameStarted
            });

            // Enhanced condition that checks multiple indicators
            // Only render game board if game phase is explicitly 'playing'
            const shouldRenderGameBoard =
              (effectiveGameStarted && effectiveGamePhase === 'playing') ||
              localStorageGameStarted;

            if (shouldRenderGameBoard) {
              console.log('[ROUTING] Rendering GameBoard component');

              // Get the gameId from the URL
              const gameId = window.location.pathname.split('/').pop();

              // Check if the gameId from URL matches the one in localStorage
              if (storedGameId && gameId !== storedGameId) {
                console.warn('[ROUTING] URL gameId does not match localStorage gameId, clearing localStorage');
                clearGameStorageData(storedGameId);
              }

              return <GameBoard />;
            } else {
              console.log('[ROUTING] Game not started, redirecting to home');
              return <Navigate to="/" />;
            }
          })()}
        </ProtectedRoute>
      } />

      {/* 404 Route */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;