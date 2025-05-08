import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
  Tab,
  HStack,
  Text,
  Button,
  Image,
  Flex,
  IconButton,
  VStack,
  Divider,
  Badge,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  AspectRatio,
  useBreakpointValue,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { clearGameStorageData } from '../../utils/storageUtils';
import { log } from '../../utils/logger';
import { keyframes } from '@emotion/react';
import { useSelector, useDispatch } from 'react-redux';
import { HamburgerIcon } from '@chakra-ui/icons';
import gameBoardImage from '../../assets/new_game_board.png';
import { boardSpaces as configBoardSpaces } from '../../config/boardConfig';
import { boardSpaces as modelBoardSpaces, properties } from '../../core/models/boardConfig';
import socketService from '../../services/socket';
import { movePlayer, updateDiceRoll, endTurn, setPlayers, setIsRolling, buyProperty, setCurrentPlayer, setGameStarted, setGamePhase } from '../../store/gameSlice';
import { updatePlayer, addPlayer } from '../../store/playerSlice';
import { FaDiceFive, FaExclamationTriangle, FaArrowCircleRight, FaHome } from 'react-icons/fa';

// --- Import Token Images ---
import tokenPepe from '../../assets/pepe.jpeg';

// --- Token Image Mapping ---
const tokenImageMap = {
  // Map all emojis to pepe.jpeg for now as a fallback
  '🚀': tokenPepe,
  '🎲': tokenPepe,
  '🐸': tokenPepe, // Pepe
  '💪': tokenPepe, // Chad
  '😢': tokenPepe, // Wojak
  '🐕': tokenPepe, // Doge
  '🐱': tokenPepe, // Cat
  '👹': tokenPepe, // Troll
  '🌕': tokenPepe, // Moon
  'pepe': tokenPepe,
  'chad': tokenPepe,
  'wojak': tokenPepe,
  'doge': tokenPepe,
  'cat': tokenPepe,
  'troll': tokenPepe,
  'moon': tokenPepe,
  'rocket': tokenPepe,
  ':)': tokenPepe, // Fallback emoji
};

// Updated board coordinates with new data
const updatedBoardCoordinates = {
  "0": {
    "left": "2.33",
    "top": "2.21",
    "width": "12.15",
    "height": "13.09"
  },
  "1": {
    "left": "2.13",
    "top": "15.54",
    "width": "12.74",
    "height": "12.41"
  },
  "2": {
    "left": "2.32",
    "top": "27.89",
    "width": "12.74",
    "height": "16.50"
  },
  "3": {
    "left": "2.23",
    "top": "44.34",
    "width": "12.35",
    "height": "8.60"
  },
  "4": {
    "left": "2.13",
    "top": "52.98",
    "width": "12.73",
    "height": "14.74"
  },
  "5": {
    "left": "2.21",
    "top": "67.49",
    "width": "12.84",
    "height": "12.60"
  },
  "6": {
    "left": "2.31",
    "top": "80.03",
    "width": "12.35",
    "height": "17.47"
  },
  "7": {
    "left": "14.97",
    "top": "80.03",
    "width": "9.32",
    "height": "17.38"
  },
  "8": {
    "left": "23.92",
    "top": "80.03",
    "width": "9.91",
    "height": "17.37"
  },
  "9": {
    "left": "33.65",
    "top": "79.93",
    "width": "9.52",
    "height": "17.47"
  },
  "10": {
    "left": "43.18",
    "top": "80.13",
    "width": "8.94",
    "height": "17.18"
  },
  "11": {
    "left": "52.27",
    "top": "80.11",
    "width": "32.23",
    "height": "17.18"
  },
  "12": {
    "left": "84.42",
    "top": "79.93",
    "width": "13.42",
    "height": "17.57"
  },
  "13": {
    "left": "84.52",
    "top": "67.28",
    "width": "13.23",
    "height": "12.60"
  },
  "14": {
    "left": "84.53",
    "top": "52.79",
    "width": "12.93",
    "height": "14.45"
  },
  "15": {
    "left": "84.42",
    "top": "40.34",
    "width": "13.42",
    "height": "12.50"
  },
  "16": {
    "left": "84.62",
    "top": "27.60",
    "width": "13.03",
    "height": "12.99"
  },
  "17": {
    "left": "84.52",
    "top": "15.15",
    "width": "13.03",
    "height": "12.70"
  },
  "18": {
    "left": "84.61",
    "top": "2.12",
    "width": "13.13",
    "height": "13.09"
  },
  "19": {
    "left": "70.82",
    "top": "2.20",
    "width": "14.00",
    "height": "13.18"
  },
  "20": {
    "left": "61.37",
    "top": "2.20",
    "width": "9.71",
    "height": "13.09"
  },
  "21": {
    "left": "51.84",
    "top": "2.30",
    "width": "9.62",
    "height": "12.99"
  },
  "22": {
    "left": "42.70",
    "top": "2.41",
    "width": "9.13",
    "height": "12.80"
  },
  "23": {
    "left": "32.97",
    "top": "2.21",
    "width": "10.01",
    "height": "12.99"
  },
  "24": {
    "left": "23.62",
    "top": "2.49",
    "width": "9.62",
    "height": "12.70"
  },
  "25": {
    "left": "14.58",
    "top": "2.39",
    "width": "9.23",
    "height": "12.90"
  }
};

// Function to map board position to correct space data
// Memoize the results to prevent recalculation on every render
const spaceDataCache = {};

const getSpaceDataByPosition = (positionIndex) => {
  try {
    // Handle undefined or null positionIndex
    if (positionIndex === undefined || positionIndex === null) {
      return { name: 'Unknown', position: 0 }; // Return a default space
    }

    // Convert to number just in case
    const position = parseInt(positionIndex);

    // Check if position is a valid number
    if (isNaN(position)) {
      return { name: 'Unknown', position: 0 };
    }

    // Check cache first
    if (spaceDataCache[position]) {
      return spaceDataCache[position];
    }

    // Find the space in modelBoardSpaces by position
    const spaceData = modelBoardSpaces?.find(space => space?.position === position);

    if (!spaceData) {
      // Fallback to looking for a space by id in configBoardSpaces
      const configSpace = configBoardSpaces?.find(space => space?.id === position);
      const result = configSpace || { name: `Space ${position}`, position };
      spaceDataCache[position] = result;
      return result;
    }

    // If it's a property, enhance with property data
    if (spaceData.propertyId && properties && properties[spaceData.propertyId]) {
      const propertyData = properties[spaceData.propertyId];
      const enhancedData = {
        ...spaceData,
        price: propertyData.cost,
        rent: propertyData.rent?.[0],
        rents: propertyData.rent?.slice(1),
        color: propertyData.group,
        houseCost: propertyData.houseCost,
        mortgageValue: propertyData.mortgage
      };

      spaceDataCache[position] = enhancedData;
      return enhancedData;
    }

    spaceDataCache[position] = spaceData;
    return spaceData;
  } catch (error) {
    return { name: 'Error', position: 0 }; // Return a fallback on error
  }
};

const GameBoard = React.memo(() => {
  // Removed excessive logging
  // Animation for UI elements
  const bounceAnimation = keyframes`
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  `;

  const pulseAnimation = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(0, 128, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0); }
  `;

  const currentTurnIndicator = {
    animation: `${bounceAnimation} 1s infinite`,
    fontWeight: 'bold',
    color: 'green.500'
  };

  const currentPlayerToken = {
    animation: `${pulseAnimation} 1.5s infinite`,
    border: '2px solid green',
    boxShadow: '0 0 5px green'
  };

  const dispatch = useDispatch();
  const {
    players = [],
    currentPlayer = null,
    gamePhase = 'waiting',
    board: currentBoardState = [],
    consecutiveDoubles = 0,
    lastRoll = [],
    gameMessages = [],
    hostId
  } = useSelector((state) => state.game || {});

  // Game state from Redux is available in the component

  // Add fallback for currentPlayerData
  const currentPlayerData = players.find(p => p.id === currentPlayer) || {};
  const toast = useToast();

  // State for rolling dice
  const [socketConnected, setSocketConnected] = useState(false);

  // State for tracking animation
  const [animatingPlayer, setAnimatingPlayer] = useState(null);
  const [animationStep, setAnimationStep] = useState(0);
  const [animationPath, setAnimationPath] = useState([]);

  // Ref for the game board container to get actual dimensions
  const boardContainerRef = useRef(null);

  const lobbyPlayers = useSelector(state => state.players.players); // object
  const gamePlayers = useSelector(state => state.game.players); // array

  const gameState = useSelector((state) => state.game);

  // Function to synchronize player data between stores if needed - optimized version
  const syncPlayerData = useCallback(() => {
    // Skip synchronization if window flag is set to prevent infinite loops
    if (window._isPlayerSyncInProgress) {
      return;
    }

    // Skip if we already have players in the game state and they match the lobby players count
    if (gamePlayers && gamePlayers.length > 0 &&
        Object.keys(lobbyPlayers || {}).length === gamePlayers.length) {
      return;
    }

    // Set flag to prevent multiple synchronizations
    window._isPlayerSyncInProgress = true;

    try {
      // Convert playerSlice players (object) to array format for gameSlice
      const playersArray = Object.values(lobbyPlayers || {}).map(player => ({
        id: player.id,
        name: player.name || `Player_${player.id.substring(0, 4)}`,
        token: player.token || player.characterToken || player.emoji || '👤',
        characterToken: player.characterToken || player.token || player.emoji || '👤',
        emoji: player.emoji || '👤',
        color: player.color || 'gray.500',
        position: player.position !== undefined ? player.position : 0,
        balance: player.balance !== undefined ? player.balance : 1500,
        properties: player.properties || [],
        inJail: player.inJail || false,
        jailTurns: player.jailTurns || 0,
        isReady: player.isReady || false,
        isHost: player.isHost || player.id === gameState.hostId || false,
        walletAddress: player.walletAddress || '',
        kekels: player.kekels || {
          k100: 2,
          k50: 5,
          k10: 10,
        },
      }));

      // Update the gameSlice with the converted players array - use meta flag to prevent circular updates
      dispatch(setPlayers(playersArray, { isSync: true }));

      // Also ensure game state is properly set
      dispatch(setGameStarted(true));
      dispatch(setGamePhase('playing'));

      // If we have a host ID but no current player, set the current player to the host
      if (gameState.hostId && !currentPlayer) {
        dispatch(setCurrentPlayer(gameState.hostId));
      }
    } finally {
      // Clear the flag after synchronization is complete
      window._isPlayerSyncInProgress = false;
    }
  }, [lobbyPlayers, gamePlayers, dispatch, gameState.hostId, currentPlayer]);

  // Add this useRef to track previous player positions
  const prevPlayerPositions = useRef({});

  const isRolling = useSelector(state => state.game.isRolling);

  // --- Property Purchase Modal State ---
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseProperty, setPurchaseProperty] = useState(null);
  const [isBuying, setIsBuying] = useState(false);
  const purchaseDisclosure = useDisclosure();

  // Helper: Check if current player can buy property
  const canBuyProperty = (player, space, boardState) => {
    // Basic validation
    if (!player || !space) {
      log('PROPERTY_PURCHASE', 'Missing player or space data');
      return false;
    }

    // Check if this is a purchasable property - ONLY allow "property" type
    // In boardConfig.js, purchasable properties have type: 'property'
    const propertyType = space.type?.toLowerCase();
    const isValidPropertyType = propertyType === 'property';

    if (!isValidPropertyType) {
      log('PROPERTY_PURCHASE', `Not a purchasable property type: ${propertyType}`);
      return false;
    }

    // Also check if it has a propertyId (required for purchase)
    if (!space.propertyId) {
      log('PROPERTY_PURCHASE', 'Missing propertyId, cannot purchase');
      return false;
    }

    // Check if it's the player's turn
    const isPlayerTurn = player.id === currentPlayer;
    if (!isPlayerTurn) {
      log('PROPERTY_PURCHASE', 'Not player\'s turn');
      return false;
    }

    // Find property state on board
    const propState = boardState.find(s => s.id === space.position);
    const isOwned = propState && propState.owner;

    // Get property cost - try multiple sources
    const propertyCost =
      (properties[space.propertyId]?.cost) ||
      (space.price) ||
      (space.propertyId ? 200 : 0); // Default cost if nothing else available

    // Check if player has enough money
    const hasEnoughMoney = player.balance >= propertyCost;

    log('PROPERTY_PURCHASE', 'Property purchase check details:', {
      propertyId: space.propertyId,
      position: space.position,
      type: propertyType,
      isValidPropertyType,
      isOwned,
      propertyCost,
      playerBalance: player.balance,
      hasEnoughMoney,
      isPlayerTurn
    });

    // Unowned, valid property type, player's turn, and player has enough money
    return !isOwned && isValidPropertyType && isPlayerTurn && hasEnoughMoney;
  };

  // Add useEffect to handle WebSocket connection during transition from game room to game board
  useEffect(() => {
    // Handle WebSocket connection during component mount

    // Get game ID from URL
    const gameId = window.location.pathname.split('/').pop();

    // Clear any game start timeout
    try {
      const timeoutId = localStorage.getItem('kekopoly_game_start_timeout_id');
      if (timeoutId) {
        clearTimeout(parseInt(timeoutId, 10));
        localStorage.removeItem('kekopoly_game_start_timeout_id');
        // console.log('[WEBSOCKET_TRANSITION] Cleared game start timeout:', timeoutId);
      }
    } catch (e) {
      console.warn('[WEBSOCKET_TRANSITION] Could not clear game start timeout:', e);
    }

    // Get player ID and token from localStorage
    // Try multiple keys for player ID to ensure we find it
    let playerId = localStorage.getItem('kekopoly_player_id');

    // If not found, try room-specific player ID (this is the key used in GameRoom.jsx)
    if (!playerId) {
      playerId = localStorage.getItem(`kekopoly_player_${gameId}`);
      // console.log(`[WEBSOCKET_TRANSITION] Found player ID in room-specific key: ${playerId}`);
    }

    const authToken = localStorage.getItem('kekopoly_token') || localStorage.getItem('kekopoly_auth_token');

    // console.log(`[WEBSOCKET_TRANSITION] Game ID from URL: ${gameId}`);
    // console.log(`[WEBSOCKET_TRANSITION] Player ID from localStorage: ${playerId}`);
    // console.log(`[WEBSOCKET_TRANSITION] Auth token available: ${authToken ? 'Yes' : 'No'}`);

    // Check if WebSocket is connected
    const isConnected = socketService?.socket?.readyState === WebSocket.OPEN;
    // console.log(`[WEBSOCKET_TRANSITION] WebSocket connected: ${isConnected}`);

    // Log current player data in both stores
    // console.log('[WEBSOCKET_TRANSITION] Current player data in stores:');
    // console.log('[WEBSOCKET_TRANSITION] lobbyPlayers (playerSlice):', lobbyPlayers);
    // console.log('[WEBSOCKET_TRANSITION] gamePlayers (gameSlice):', gamePlayers);

    // Ensure game state is properly set for playing
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing'));

    // Add a timeout to detect if the game doesn't exist or can't be loaded
    const gameLoadTimeout = setTimeout(() => {
      // If after 5 seconds we still don't have any players, the game probably doesn't exist
      if ((!players || players.length === 0) && (!gamePlayers || gamePlayers.length === 0)) {
        console.error('[WEBSOCKET_TRANSITION] Game not found or cannot be loaded after timeout');

        // Clear localStorage data for this game
        clearGameStorageData(gameId);

        // Show error toast
        toast({
          title: "Game Not Found",
          description: "The game you're trying to access doesn't exist or has ended. Redirecting to home page.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });

        // Navigate back to home page
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
    }, 5000);

    // If WebSocket is not connected, establish connection
    if (!isConnected && gameId && playerId && authToken) {
      // console.log('[WEBSOCKET_TRANSITION] WebSocket not connected, establishing connection');

      // Generate a new session ID for this connection
      const sessionId = Math.random().toString(36).substring(2, 15);
      // console.log(`[WEBSOCKET_TRANSITION] Generated new session ID: ${sessionId}`);

      // Store session ID in localStorage
      localStorage.setItem('kekopoly_session_id', sessionId);

      // Connect to WebSocket
      socketService.connect(gameId, playerId, authToken)
        .then(() => {
          // console.log('[WEBSOCKET_TRANSITION] WebSocket connection established successfully');
          setSocketConnected(true);

          // Request active players and game state after connection
          setTimeout(() => {
            // console.log('[WEBSOCKET_TRANSITION] Requesting active players and game state');
            socketService.sendMessage('get_active_players');
            socketService.sendMessage('get_game_state', { full: true });

            // Start periodic state synchronization
            // console.log('[WEBSOCKET_TRANSITION] Starting periodic state synchronization');
            socketService.startPeriodicStateSync();

            // Sync player data between stores
            syncPlayerData();
          }, 200);
        })
        .catch(error => {
          console.error('[WEBSOCKET_TRANSITION] Failed to establish WebSocket connection:', error);
          setSocketConnected(false);

          // Try again after a short delay
          setTimeout(() => {
            // console.log('[WEBSOCKET_TRANSITION] Retrying WebSocket connection');
            socketService.connect(gameId, playerId, authToken)
              .then(() => {
                // console.log('[WEBSOCKET_TRANSITION] WebSocket connection established on retry');
                setSocketConnected(true);

                // Request active players and game state after connection
                setTimeout(() => {
                  socketService.sendMessage('get_active_players');
                  socketService.sendMessage('get_game_state', { full: true });

                  // Start periodic state synchronization
                  // console.log('[WEBSOCKET_TRANSITION] Starting periodic state synchronization on retry');
                  socketService.startPeriodicStateSync();

                  // Sync player data between stores
                  syncPlayerData();
                }, 200);
              })
              .catch(error => {
                console.error('[WEBSOCKET_TRANSITION] Failed to establish WebSocket connection on retry:', error);
                setSocketConnected(false);

                // Show toast notification
                toast({
                  title: "Connection Error",
                  description: "Failed to connect to game server. Please refresh the page.",
                  status: "error",
                  duration: 5000,
                  isClosable: true,
                });
              });
          }, 1000);
        });
    } else if (isConnected) {
      // If WebSocket is already connected, just request active players and game state
      // console.log('[WEBSOCKET_TRANSITION] WebSocket already connected, requesting data');
      setSocketConnected(true);

      // Request active players and game state
      socketService.sendMessage('get_active_players');
      socketService.sendMessage('get_game_state', { full: true });

      // Start periodic state synchronization
      // console.log('[WEBSOCKET_TRANSITION] Starting periodic state synchronization for existing connection');
      socketService.startPeriodicStateSync();

      // Sync player data between stores
      syncPlayerData();
    }

    // Clean up the timeout when component unmounts
    return () => {
      clearTimeout(gameLoadTimeout);
    };
  }, [dispatch, syncPlayerData, toast, players, gamePlayers]);

  // Run player data synchronization only when component mounts
  useEffect(() => {
    // Ensure game state is properly set for playing
    dispatch(setGameStarted(true));
    dispatch(setGamePhase('playing'));

    // Always sync player data on mount to ensure all players are properly rendered
    syncPlayerData();

    // Only run this effect once on mount
  }, [dispatch, syncPlayerData]);

  // Add useEffect to handle the case where the current player is null
  useEffect(() => {
    // If we have players but no current player, request the current turn from the server
    if (players.length > 0 && !currentPlayer) {
      // console.log('[GAMEBOARD] Requesting player data on mount');

      // If we're the host, set the current player to the host
      if (hostId && socketService?.localPlayerId === hostId) {
        // console.log('[GAMEBOARD] Setting current player to host:', hostId);
        dispatch(setCurrentPlayer(hostId));
      }

      // Request current turn from server
      if (socketService?.socket?.readyState === WebSocket.OPEN) {
        // console.log('[GAMEBOARD] Requesting current turn from server');
        socketService.sendMessage('get_current_turn', {});

        // Also request full game state
        socketService.sendMessage('get_game_state', { full: true });
      }
    }
  }, [players, currentPlayer, hostId, dispatch]);

  // Add useEffect to automatically fix player display issues on component mount
  // Use a ref to ensure this only runs once
  const playerSyncRef = useRef(false);

  useEffect(() => {
    // Only run this once
    if (playerSyncRef.current) return;
    playerSyncRef.current = true;

    // Check if we have players in the Redux store but not in uniquePlayers
    const reduxPlayers = Object.values(lobbyPlayers || {});

    // If we have players in the Redux store but uniquePlayers is empty, force update
    if (reduxPlayers.length > 0 && players.length === 0) {
      // Dispatch action to sync players from Redux store to game state
      dispatch(setPlayers(reduxPlayers));

      // Request active players from server
      if (socketService?.socket?.readyState === WebSocket.OPEN) {
        socketService.sendMessage('get_active_players');
        socketService.sendMessage('get_game_state', { full: true });
      }
    }

    // If we have players in the game state but not in the Redux store, sync them to Redux
    if (players.length > 0 && reduxPlayers.length === 0) {
      // Add each player to the Redux store
      players.forEach(player => {
        if (player && player.id) {
          dispatch(addPlayer({
            playerId: player.id,
            playerData: player
          }));
        }
      });
    }

    // Request active players from server regardless
    setTimeout(() => {
      if (socketService?.socket?.readyState === WebSocket.OPEN) {
        socketService.sendMessage('get_active_players');
        socketService.sendMessage('get_game_state', { full: true });
      }
    }, 500);
  }, [dispatch, players, lobbyPlayers]);

  // Add WebSocket connection listener - optimized version
  useEffect(() => {
    // Function to handle WebSocket connection events
    const handleWebSocketConnected = () => {
      setSocketConnected(true);

      // Request active players and game state - but only if we don't already have players
      if (!players || players.length === 0) {
        setTimeout(() => {
          if (socketService?.socket?.readyState === WebSocket.OPEN) {
            socketService.sendMessage('get_active_players');
            socketService.sendMessage('get_game_state', { full: true });
          }
        }, 200);
      }
    };

    // Function to handle WebSocket disconnection events
    const handleWebSocketDisconnected = () => {
      setSocketConnected(false);

      // Show toast notification
      toast({
        title: "Connection Lost",
        description: "Lost connection to game server. Attempting to reconnect...",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    };

    // Add event listeners
    window.addEventListener('websocket-connected', handleWebSocketConnected);
    window.addEventListener('socket-connected', handleWebSocketConnected);
    window.addEventListener('socket-disconnected', handleWebSocketDisconnected);

    // Set up periodic connection check with reduced frequency
    const connectionCheckInterval = setInterval(() => {
      const isConnected = socketService?.socket?.readyState === WebSocket.OPEN;

      // Only update state if connection status has changed
      if (isConnected !== socketConnected) {
        setSocketConnected(isConnected);

        // Only try to reconnect if we were previously connected and now disconnected
        if (!isConnected && socketConnected) {
          // Get connection info from localStorage
          const gameId = localStorage.getItem('kekopoly_game_id');
          const playerId = localStorage.getItem('kekopoly_player_id');
          const authToken = localStorage.getItem('kekopoly_auth_token');

          if (gameId && playerId && authToken) {
            socketService.connect(gameId, playerId, authToken)
              .catch(() => {
                // Silently handle error to avoid console spam
              });
          }
        }
      }
    }, 15000); // Further reduced frequency to 15 seconds

    // Clean up event listeners and interval on unmount
    return () => {
      window.removeEventListener('websocket-connected', handleWebSocketConnected);
      window.removeEventListener('socket-connected', handleWebSocketConnected);
      window.removeEventListener('socket-disconnected', handleWebSocketDisconnected);
      clearInterval(connectionCheckInterval);

      // Reset game start processing flag
      window._gameStartProcessed = false;

      // Reset player sync flag
      window._isPlayerSyncInProgress = false;
    };
  }, [socketConnected, players, toast]);

  // Detect after movement if player is on an unowned property
  useEffect(() => {
    if (!currentPlayerData || !currentPlayerData.position) return;

    // Use useMemo to avoid recalculating space data on every render
    const space = getSpaceDataByPosition(currentPlayerData.position);

    if (canBuyProperty(currentPlayerData, space, currentBoardState)) {
      setPurchaseProperty(space);
      setShowPurchaseModal(true);
      purchaseDisclosure.onOpen();
    } else {
      setShowPurchaseModal(false);
      setPurchaseProperty(null);
      purchaseDisclosure.onClose();
    }
    // eslint-disable-next-line
  }, [currentPlayerData?.position, currentBoardState, purchaseDisclosure]);

  // Handler: Buy property
  const handleBuyProperty = async () => {
    if (!purchaseProperty) return;
    setIsBuying(true);
    try {
      // Use the local Redux action to update the UI immediately
      dispatch(buyProperty({
        playerId: currentPlayerData?.id,
        propertyId: purchaseProperty.position // Use position as propertyId for board spaces
      }));

      // Also send via WebSocket if connected
      if (socketService && socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
        socketService.sendMessage('buy_property', {
          propertyId: purchaseProperty.propertyId || purchaseProperty.position,
          playerId: currentPlayerData?.id
        });
      }

      toast({ title: 'Property purchased!', status: 'success', duration: 3000, isClosable: true });
      setShowPurchaseModal(false);
      setPurchaseProperty(null);
      purchaseDisclosure.onClose();
    } catch (err) {
      toast({ title: 'Error', description: err.message, status: 'error', duration: 4000, isClosable: true });
    } finally {
      setIsBuying(false);
    }
  };

  // Memoize player initialization to prevent unnecessary processing
  const initializePlayers = useMemo(() => {
    if (
      gamePlayers.length === 0 &&
      Object.keys(lobbyPlayers).length > 0 &&
      gameState.hostId
    ) {
      // Sort players: host first, then others
      return Object.values(lobbyPlayers)
        .sort((a, b) => (a.id === gameState.hostId ? -1 : b.id === gameState.hostId ? 1 : 0))
        .map(p => {
          // Ensure token is set
          const token = p.token || p.characterToken || p.emoji || ':)';

          // Ensure color is set
          const color = p.color || 'green.500';

          return {
            ...p,
            token: token,
            color: color,
            position: p.position || 1, // default to START
            balance: p.balance || 1500,
            properties: p.properties || [],
            inJail: p.inJail || false,
            jailTurns: p.jailTurns || 0,
            isReady: p.isReady || false,
            isHost: p.isHost || p.id === gameState.hostId,
          };
        });
    }
    return null;
  }, [lobbyPlayers, gamePlayers, gameState.hostId]);

  // Apply the initialization when the memoized value changes
  useEffect(() => {
    if (initializePlayers) {
      dispatch(setPlayers(initializePlayers));

      if (gameState.hostId) {
        dispatch({ type: 'game/setCurrentPlayer', payload: gameState.hostId }); // Host starts
      }
    }
  }, [initializePlayers, dispatch, gameState.hostId]);

  // Initialize socket connection
  useEffect(() => {
    // Check if socketService exists and if socket is already connected
    if (!socketService || !socketService.socket || socketService.socket.readyState !== WebSocket.OPEN) {
      try {
        // Get game ID from URL path (format: /game/{gameId})
        const pathGameId = window.location.pathname.split('/').pop();

        // Fallback to URL params or Redux if path extraction fails
        const urlParams = new URLSearchParams(window.location.search);
        const queryGameId = urlParams.get('gameId');

        // Try multiple sources for gameId with path having highest priority
        const gameId = pathGameId || queryGameId || currentPlayerData?.gameId || localStorage.getItem('kekopoly_game_id');

        // Try multiple sources for playerId
        const playerId = currentPlayerData?.id || localStorage.getItem('kekopoly_player_id');

        // Check for preserved connection info in localStorage
        const preservedGameId = localStorage.getItem('kekopoly_socket_gameId');
        const preservedPlayerId = localStorage.getItem('kekopoly_socket_playerId');
        const preservedTimestamp = localStorage.getItem('kekopoly_socket_timestamp');
        const isPreserved = localStorage.getItem('kekopoly_socket_preserve') === 'true';

        // Use preserved values if they exist and are recent (within last 30 seconds)
        // Increase the time window to handle slower transitions
        const usePreserved = preservedGameId && preservedPlayerId &&
                            preservedTimestamp && (Date.now() - parseInt(preservedTimestamp)) < 30000;

        // Use either the URL/Redux values or the preserved values
        const finalGameId = usePreserved ? preservedGameId : gameId;
        const finalPlayerId = usePreserved ? preservedPlayerId : playerId;

        // console.log(`[SOCKET] Connection info - URL/Redux: gameId=${gameId}, playerId=${playerId}`);
        // console.log(`[SOCKET] Preserved info: gameId=${preservedGameId}, playerId=${preservedPlayerId}, isPreserved=${isPreserved}, usePreserved=${usePreserved}`);
        // console.log(`[SOCKET] Using: gameId=${finalGameId}, playerId=${finalPlayerId}`);

        // Final fallback: Try to get values from any available localStorage keys
        let effectiveFinalGameId = finalGameId;
        let effectiveFinalPlayerId = finalPlayerId;

        if (!effectiveFinalGameId || !effectiveFinalPlayerId) {
          console.warn('[SOCKET] Missing primary gameId or playerId, trying fallback sources');

          // Try all possible localStorage keys for gameId
          const possibleGameIdKeys = [
            'kekopoly_game_id',
            'kekopoly_socket_gameId',
            'kekopoly_active_game_id'
          ];

          // Try all possible localStorage keys for playerId
          const possiblePlayerIdKeys = [
            'kekopoly_player_id',
            'kekopoly_socket_playerId',
            'kekopoly_active_player_id',
            'kekopoly_local_player_id'
          ];

          // Try to find a valid gameId
          for (const key of possibleGameIdKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              // console.log(`[SOCKET] Found fallback gameId in localStorage key ${key}: ${value}`);
              effectiveFinalGameId = value;
              break;
            }
          }

          // Try to find a valid playerId
          for (const key of possiblePlayerIdKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              // console.log(`[SOCKET] Found fallback playerId in localStorage key ${key}: ${value}`);
              effectiveFinalPlayerId = value;
              break;
            }
          }
        }

        if (!effectiveFinalGameId || !effectiveFinalPlayerId) {
          console.warn('[SOCKET] Missing gameId or playerId after all fallbacks, cannot connect to socket');
          setSocketConnected(false);

          // Show error toast to user
          toast({
            title: "Connection Error",
            description: "Could not determine game ID or player ID. Please try refreshing the page.",
            status: "error",
            duration: 5000,
            isClosable: true,
          });

          return; // Exit early if we don't have required data
        }

        // Update the log with our effective values that include fallbacks
        // console.log(`[SOCKET] Connecting to game: ${effectiveFinalGameId} as player: ${effectiveFinalPlayerId}`);

        // Initialize the socket service if it exists
        if (socketService?.initialize) {
          socketService.initialize();
        } else {
          console.warn('[SOCKET] socketService.initialize is not available');
          setSocketConnected(false);
          return;
        }

        // Get authentication token from localStorage
        const authToken = localStorage.getItem('kekopoly_token') || localStorage.getItem(`kekopoly_token_${finalGameId}`);

        if (!authToken) {
          console.warn('[SOCKET] No authentication token found');
          setSocketConnected(false);
          return;
        }

        // console.log(`[SOCKET] Using token: ${authToken.substring(0, 20)}...`);

        // Reset navigation flags to ensure proper connection
        socketService.isNavigating = false;
        socketService.preserveConnection = false;

        // Connect to the socket with proper authentication using effective values
        if (socketService?.connect) {
          socketService.connect(effectiveFinalGameId, effectiveFinalPlayerId, authToken)
            .then(() => {
              // console.log('[SOCKET] Connection successful');
              setSocketConnected(true);

              // Clear preserved connection info after successful connection
              if (usePreserved) {
                try {
                  localStorage.removeItem('kekopoly_socket_preserve');
                  localStorage.removeItem('kekopoly_socket_gameId');
                  localStorage.removeItem('kekopoly_socket_playerId');
                  localStorage.removeItem('kekopoly_socket_timestamp');
                } catch (e) {
                  console.warn('[SOCKET] Could not clear preserved connection info:', e);
                }
              }

              // Request game state and active players to ensure we're in sync
              setTimeout(() => {
                if (socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
                  // console.log('[SOCKET] Requesting game state and active players after connection');
                  socketService.sendMessage('get_game_state', { full: true });
                  socketService.sendMessage('get_active_players');
                  socketService.sendMessage('get_current_turn', {});
                }
              }, 500);
            })
            .catch(err => {
              console.error('[SOCKET] Connection failed:', err);
              setSocketConnected(false);

              // Try again after a short delay if we have preserved connection info
              if (usePreserved) {
                // console.log('[SOCKET] Will try reconnecting again in 1 second with preserved info');
                setTimeout(() => {
                  if (socketService?.connect) {
                    socketService.connect(effectiveFinalGameId, effectiveFinalPlayerId, authToken)
                      .catch(err => console.error("[SOCKET] Second reconnect attempt failed:", err));
                  }
                }, 1000);
              }
            });
        } else {
          console.warn('[SOCKET] socketService.connect is not available');
          setSocketConnected(false);
          return;
        }

        // Set up connection event listener
        const handleConnect = () => {
          // console.log('[SOCKET] WebSocket connected event received');
          setSocketConnected(true);
        };

        // Set up disconnect event listener
        const handleDisconnect = () => {
          // console.log('[SOCKET] WebSocket disconnected event received');
          setSocketConnected(false);
        };

        // Add event listeners
        window.addEventListener('socket-connected', handleConnect);
        window.addEventListener('socket-disconnected', handleDisconnect);

        // Set up periodic connection check
        const checkConnectionInterval = setInterval(() => {
          const isConnected = socketService?.socket?.readyState === WebSocket.OPEN;
          // console.log(`[SOCKET] Periodic connection check: ${isConnected ? 'Connected' : 'Disconnected'}`);

          // If disconnected but should be connected, try to reconnect
          if (!isConnected && effectiveFinalGameId && effectiveFinalPlayerId && authToken) {
            // console.log('[SOCKET] Detected disconnection, attempting to reconnect');
            socketService.connect(effectiveFinalGameId, effectiveFinalPlayerId, authToken)
              .catch(err => console.error('[SOCKET] Reconnection attempt failed:', err));
          }

          setSocketConnected(isConnected);
        }, 5000);

        // Clean up event listeners and interval
        return () => {
          window.removeEventListener('socket-connected', handleConnect);
          window.removeEventListener('socket-disconnected', handleDisconnect);
          clearInterval(checkConnectionInterval);

          // Check if we're navigating away from the game board
          // If we're just navigating to another page within the app, preserve the connection
          // console.log('[GAMEBOARD] Component unmounting, checking navigation state');

          // We want to preserve the connection if we're navigating within the app
          // but disconnect if we're leaving the app or refreshing
          const isNavigatingWithinApp = window.location.pathname.includes('/');

          // Store connection info in localStorage as a backup
          if (isNavigatingWithinApp && effectiveFinalGameId && effectiveFinalPlayerId) {
            try {
              localStorage.setItem('kekopoly_socket_preserve', 'true');
              localStorage.setItem('kekopoly_socket_gameId', effectiveFinalGameId);
              localStorage.setItem('kekopoly_socket_playerId', effectiveFinalPlayerId);
              localStorage.setItem('kekopoly_socket_timestamp', Date.now().toString());

              // Also store in standard keys for redundancy
              localStorage.setItem('kekopoly_game_id', effectiveFinalGameId);
              localStorage.setItem('kekopoly_player_id', effectiveFinalPlayerId);
              // console.log('[GAMEBOARD] Stored connection info in localStorage for potential reconnection');
            } catch (e) {
              console.warn('[GAMEBOARD] Could not store socket preservation info in localStorage:', e);
            }
          }

          // console.log(`[GAMEBOARD] Disconnecting socket with preserveForNavigation=${isNavigatingWithinApp}`);
          if (socketService?.disconnect) {
            socketService.disconnect(isNavigatingWithinApp);
          }
        };
      } catch (error) {
        console.error('[SOCKET] Error in socket connection effect:', error);
        setSocketConnected(false);
        toast({
          title: "Connection Error",
          description: "Failed to connect to game server",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    } else {
      // console.log('[SOCKET] Socket already connected');
      setSocketConnected(true);
    }
  }, [toast]);

  // Add a new effect to request player data when the component mounts
  // Use a ref to ensure this only runs once
  const playerDataRequestRef = useRef(false);

  useEffect(() => {
    // Only run this once when socket is connected
    if (playerDataRequestRef.current || !socketConnected) return;
    playerDataRequestRef.current = true;

    if (socketService && socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
      // console.log('[GAMEBOARD] Requesting player data on mount');

      // Request game state with full details
      socketService.sendMessage('get_game_state', { full: true });

      // Request active players to ensure we have all player data
      socketService.sendMessage('get_active_players', {});

      // Request current turn information
      socketService.sendMessage('get_current_turn', {});

      // Try to restore player token data from localStorage if needed
      try {
        const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
        if (storedTokenData && socketService.localPlayerId) {
          const parsedTokenData = JSON.parse(storedTokenData);
          // console.log('[GAMEBOARD] Found stored player token data:', parsedTokenData);

          // Find the local player in the players array
          const localPlayer = players.find(p => p.id === socketService.localPlayerId);

          // Update the player in Redux regardless of current token state
          // This ensures token data is always set correctly
          dispatch(updatePlayer({
            playerId: socketService.localPlayerId,
            updates: {
              token: parsedTokenData.token || (localPlayer?.token || ''),
              emoji: parsedTokenData.emoji || (localPlayer?.emoji || '👤'),
              color: parsedTokenData.color || (localPlayer?.color || 'gray.500'),
              name: parsedTokenData.name || (localPlayer?.name || `Player_${socketService.localPlayerId.substring(0, 4)}`),
              characterToken: parsedTokenData.token || parsedTokenData.emoji || (localPlayer?.token || localPlayer?.emoji || '👤')
            }
          }));

          // Send token updates to the server
          socketService.sendMessage('update_player_info', {
            playerId: socketService.localPlayerId,
            characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤',
            token: parsedTokenData.token || '',
            emoji: parsedTokenData.emoji || '👤',
            color: parsedTokenData.color || 'gray.500',
            name: parsedTokenData.name || `Player_${socketService.localPlayerId.substring(0, 4)}`
          });
        }
      } catch (e) {
        console.warn('[GAMEBOARD] Error restoring token data from localStorage:', e);
      }
    }
  }, [socketConnected, dispatch, players]);

  // This useEffect previously updated board dimensions
  // We've removed it since we're not using the dimensions state anymore

  // Use updated coordinates - START is position 1 according to the user
  const startCoords = updatedBoardCoordinates["1"]; // START is at index 1

  // Memoize unique players to prevent recalculation on every render
  const uniquePlayers = useMemo(() => {
    const result = [];

    // First, ensure we have valid player data
    if (players && Array.isArray(players)) {
      players.forEach(player => {
        if (!player || !player.id) {
          return;
        }

        if (!result.find(p => p.id === player.id)) {
          // Make a copy of the player object to avoid reference issues
          result.push({...player});
        }
      });
    }

    return result;
  }, [players]);

  // Memoize the getPlayerById function to improve performance
  const getPlayerById = useCallback((id) => {
    // Handle undefined inputs
    if (id === undefined || id === null) {
      return null;
    }

    // Handle undefined or empty players array
    if (!players || !Array.isArray(players) || players.length === 0) {
      return null;
    }

    return players.find(p => p && p.id === id) || null;
  }, [players]);

  // Memoize ownable spaces to prevent recalculation on every render
  const ownableSpaces = useMemo(() => {
    return modelBoardSpaces.filter(space =>
      space.propertyId && properties[space.propertyId]
    ).map(space => ({
      ...space,
      id: space.position, // Map position to id for compatibility
      price: properties[space.propertyId]?.cost,
      color: properties[space.propertyId]?.group
    }));
  }, []);

  // Handle clicking on a property space
  const handlePropertyClick = (positionIndex) => {
    // This function is now just a placeholder for the click handler
    // The Popover component handles displaying property details
    // console.log(`Clicked on property at position ${positionIndex}`);
  };

  // Get property details for display - memoized to prevent recreation on every render
  const getPropertyDetails = useCallback((property) => {
    if (!property) return null;

    let details = [];

    // Add basic info
    details.push({ label: "Type", value: property.type });

    // Add price if property has propertyId
    const propertyData = property.propertyId ? properties[property.propertyId] : null;

    if (propertyData) {
      details.push({ label: "Price", value: `${propertyData.cost} Kekels` });

      // Add rent info based on property type
      if (propertyData.rent && propertyData.rent.length > 0) {
        details.push({ label: "Rent", value: `${propertyData.rent[0]} Kekels` });

        if (propertyData.group === 'railroad') {
          details.push({
            label: "With Railroads",
            value: propertyData.rent.slice(1).map((r, i) => `${i+1}: ${r}`).join(', ')
          });
        } else if (propertyData.group !== 'utility') {
          details.push({
            label: "With Houses",
            value: propertyData.rent.slice(1).map((r, i) => `${i+1}: ${r}`).join(', ')
          });
        }
      }

      details.push({ label: "Color Group", value: propertyData.group || 'None' });

      if (propertyData.houseCost) {
        details.push({ label: "House Cost", value: `${propertyData.houseCost} Kekels` });
      }

      if (propertyData.mortgage) {
        details.push({ label: "Mortgage Value", value: `${propertyData.mortgage} Kekels` });
      }
    } else if (property.type === 'tax' && property.amount) {
      details.push({ label: "Tax", value: `${property.amount} Kekels` });
    }

    return details;
  }, []);

  // Get owner information for a property - memoized to prevent recreation on every render
  const getPropertyOwner = useCallback((propertyPosition) => {
    try {
      // Handle undefined inputs
      if (propertyPosition === undefined || propertyPosition === null) {
        return null;
      }

      // Handle undefined or empty currentBoardState
      if (!currentBoardState || !Array.isArray(currentBoardState) || currentBoardState.length === 0) {
        return null;
      }

      const spaceState = currentBoardState.find(s => s && s.id === propertyPosition);
      if (!spaceState || !spaceState.owner) return null;

      // Safely get player by ID
      const owner = getPlayerById(spaceState.owner);
      return owner || null; // Ensure we return null if player not found
    } catch (error) {
      return null;
    }
  }, [currentBoardState, getPlayerById]);

  // Function to get space name by position - memoized to prevent recreation on every render
  const getSpaceName = useCallback((position) => {
    try {
      // Handle undefined position
      if (position === undefined || position === null) {
        return 'Unknown';
      }

      const space = getSpaceDataByPosition(position);
      return space?.name || `Space ${position}`;
    } catch (error) {
      return 'Unknown';
    }
  }, []);

  // Get viewport size for responsive adjustments
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Function to animate player movement step by step
  const animatePlayerMovement = (playerId, startPosition, steps, directPosition = null) => {
    // console.log(`[ANIMATION] Starting animation for player ${playerId} from position ${startPosition}, steps: ${steps}, directPosition: ${directPosition}`);

    // Default to position 1 (START) if startPosition is undefined
    const currentPosition = startPosition || 1;

    // Clear any existing animation
    setAnimationStep(0);

    // Calculate all positions the player will move through
    const path = [];

    if (directPosition !== null) {
      // Direct movement to a specific position (e.g., going to jail)
      // console.log(`[ANIMATION] Direct movement to position ${directPosition}`);
      // Include starting position for smooth animation
      path.push(currentPosition);
      path.push(directPosition);
    } else {
      // We need to handle the board layout correctly
      // The board positions are from 0 to 25 with position 1 being START
      let currentPos = parseInt(currentPosition);
      // console.log(`[ANIMATION] Starting path calculation from position ${currentPos}`);

      // Generate the path of positions
      for (let i = 0; i <= steps; i++) {
        if (i === 0) {
          // Add current position as first step
          path.push(currentPos);
          // console.log(`[ANIMATION] Path step ${i}: position ${currentPos} (starting position)`);
          continue;
        }

        // Move to next position
        currentPos += 1;

        // If we go beyond position 25, wrap back to position 1
        if (currentPos > 25) {
          currentPos = 1;
          // console.log(`[ANIMATION] Wrapped around the board to position 1`);
        }

        // Add this position to the path
        path.push(currentPos);
        // console.log(`[ANIMATION] Path step ${i}: position ${currentPos}`);
      }
    }

    // console.log(`[ANIMATION] Final path:`, path);

    // Set the animation data
    setAnimatingPlayer(playerId);
    setAnimationPath(path);

    // Start the animation
    const animateStep = (step) => {
      if (step >= path.length) {
        // Animation complete
        // console.log(`[ANIMATION] Animation complete for player ${playerId}`);

        // Get the final position
        const finalPosition = path[path.length - 1];
        // console.log(`[ANIMATION] Final position for player ${playerId}: ${finalPosition}`);

        // Get the old position for the movement message
        const oldPosition = path[0];

        // Important: Update the player's position in the prevPlayerPositions ref
        // This prevents the position tracking effect from triggering another animation
        prevPlayerPositions.current[playerId] = finalPosition;
        // console.log(`[ANIMATION] Updated prevPlayerPositions for player ${playerId} to ${finalPosition}`);

        // Find the player in the Redux state
        const player = players.find(p => p.id === playerId);

        // Only dispatch movePlayer if the player's current position doesn't match the final position
        // This prevents unnecessary Redux updates
        if (player && player.position !== finalPosition) {
          // console.log(`[ANIMATION] Dispatching movePlayer for player ${playerId} from ${oldPosition} to ${finalPosition}`);
          dispatch(movePlayer({
            playerId: playerId,
            newPosition: finalPosition,
            oldPosition: oldPosition,
            diceValues: lastRoll.dice || [1, 1]
          }));
        } else {
          // console.log(`[ANIMATION] Player ${playerId} already at position ${finalPosition}, skipping movePlayer dispatch`);
        }

        // Clear animation state
        setAnimatingPlayer(null);
        setAnimationPath([]);

        return;
      }

      // Update the player's temporary position for animation
      // console.log(`[ANIMATION] Step ${step}: player ${playerId} at position ${path[step]}`);
      setAnimationStep(step);

      // Move to next step after delay
      setTimeout(() => {
        animateStep(step + 1);
      }, 300); // 300ms delay between steps
    };

    // Start animation with step 0
    animateStep(0);
  };

  // Handle the Roll Dice button click
  const handleRollDice = () => {
    // Log current game state for debugging
    // console.log('[DICE] Current game state before roll:', {
    //   currentPlayer,
    //   localPlayerId: socketService?.localPlayerId,
    //   players: players.map(p => ({ id: p.id, name: p.name, position: p.position })),
    //   isMyTurn: socketService?.isLocalPlayerTurn?.()
    // });

    try {
      // First, check if socket is connected
      if (!socketService || !socketService.socket || socketService.socket.readyState !== WebSocket.OPEN) {
        console.error('[DICE] Cannot roll dice: WebSocket not connected');
        toast({
          title: "Connection Error",
          description: "Not connected to game server",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        dispatch(setIsRolling(false));
        return;
      }

      // Function to get current turn from server
      const getCurrentTurnFromServer = () => {
        return new Promise((resolve) => {
          // Create a one-time message handler
          const handleGameStateResponse = (event) => {
            try {
              const data = JSON.parse(event.data);

              // Check if this is a game state or turn response
              if ((data.type === 'game_state' && data.currentTurn) ||
                  (data.type === 'game_turn') ||
                  (data.type === 'current_turn')) {

                // Extract the current turn from the response
                const serverCurrentTurn = data.currentTurn || data.currentPlayer;
                // console.log(`[DICE] Server reports current turn is: ${serverCurrentTurn}`);

                // Update Redux with the server's current turn
                if (serverCurrentTurn) {
                  dispatch(setCurrentPlayer(serverCurrentTurn));
                }

                // Remove the event listener
                socketService.socket.removeEventListener('message', handleGameStateResponse);

                // Resolve with the server's current turn
                resolve(serverCurrentTurn);
              }
            } catch (e) {
              console.error('[DICE] Error processing game state response:', e);
            }
          };

          // Add the event listener
          socketService.socket.addEventListener('message', handleGameStateResponse);

          // Send the request
          socketService.sendMessage('get_current_turn', {});

          // Set a timeout to resolve anyway after 500ms
          setTimeout(() => {
            socketService.socket.removeEventListener('message', handleGameStateResponse);
            resolve(null); // Resolve with null if no response
          }, 500);
        });
      };

      // Using the comprehensive handleLocalDiceRoll function defined below

      // Function to continue with dice roll after validation
      const continueWithDiceRoll = () => {
        // Check if player is in jail
        if (currentPlayerData?.inJail) {
          toast({
            title: "You're in jail!",
            description: `You need to roll doubles or wait ${currentPlayerData.jailTurns} more turns.`,
            status: "warning",
            duration: 3000,
            isClosable: true,
          });
          dispatch(setIsRolling(false));
          return;
        }

        // Set rolling state to true
        dispatch(setIsRolling(true));

        // Check if WebSocket is connected before trying to roll dice
        if (socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
          // console.log('[DICE] Sending roll_dice request to server');

          // Add error handler for dice roll failures
          const handleDiceRollError = (event) => {
            console.error('[DICE] Error from server when rolling dice:', event.detail);

            // Get the error message
            const errorMessage = event.detail?.message || "The server couldn't process your dice roll. Try again.";

            // Check if it's a "not player's turn" error
            if (errorMessage.includes("not player's turn")) {
              // Force refresh the current player from the server
              socketService.sendMessage('get_current_turn', {});

              // Get the current player name
              const currentPlayerObj = players.find(p => p.id === currentPlayer);
              const currentPlayerName = currentPlayerObj?.name || "another player";

              toast({
                title: "Not your turn",
                description: `It's ${currentPlayerName}'s turn. The game state has been refreshed.`,
                status: "warning",
                duration: 3000,
                isClosable: true,
              });
            } else {
              // Show generic error for other issues
              toast({
                title: "Dice Roll Error",
                description: errorMessage,
                status: "error",
                duration: 3000,
                isClosable: true,
              });
            }

            dispatch(setIsRolling(false));
          };

          // Add handler for successful dice roll
          const handleDiceRollSuccess = (event) => {
            // console.log('[DICE] Dice roll success event received:', event.detail);

            if (event.detail && event.detail.dice && event.detail.newPosition) {
              const { dice, newPosition, playerId, oldPosition } = event.detail;

              // Get current position
              const player = players.find(p => p.id === playerId);
              if (player) {
                const currentPosition = oldPosition || player.position || 1;

                // Calculate steps based on the dice roll, not the position difference
                // This ensures we move the correct number of spaces from the current position
                const diceTotal = dice[0] + dice[1];

                // Animate the movement using the dice total as steps
                animatePlayerMovement(playerId, currentPosition, diceTotal);
              }
            }
          };

          // Register event handlers
          window.addEventListener('dice-roll-error', handleDiceRollError);
          window.addEventListener('dice-roll-success', handleDiceRollSuccess);

          // First, request the current turn from the server to ensure we have the latest state
          socketService.sendMessage('get_current_turn', {});

          // Short delay to allow the server to respond with the current turn
          setTimeout(() => {
            // Double-check with the server one more time to be absolutely sure
            socketService.sendMessage('get_current_turn', {});

            // Wait a tiny bit more for the server response
            setTimeout(() => {
              // Final check if it's still our turn
              if (socketService.isLocalPlayerTurn()) {
                // console.log('[DICE] Final check confirms it is our turn, proceeding with roll');
                // Call the socket service to roll dice
                socketService.rollDice();
              } else {
                // Turn changed during the delay
                const finalState = store.getState();
                const finalCurrentPlayer = finalState.game.currentPlayer;
                const currentPlayerObj = players.find(p => p.id === finalCurrentPlayer);
                const currentPlayerName = currentPlayerObj?.name || "another player";

                // console.log(`[DICE] Turn changed during delay. Current turn: ${finalCurrentPlayer}, Local player: ${socketService?.localPlayerId}`);

                toast({
                  title: "Not your turn",
                  description: `It's ${currentPlayerName}'s turn to roll the dice`,
                  status: "warning",
                  duration: 3000,
                  isClosable: true,
                });

                dispatch(setIsRolling(false));

                // Clean up event listeners
                window.removeEventListener('dice-roll-error', handleDiceRollError);
                window.removeEventListener('dice-roll-success', handleDiceRollSuccess);
              }
            }, 100);
          }, 200);

          // Set up a timeout to handle potential WebSocket failures
          const wsTimeout = setTimeout(() => {
            if (isRolling) {
              // console.log('[DICE] WebSocket timeout, falling back to local dice roll');
              window.removeEventListener('dice-roll-error', handleDiceRollError);
              window.removeEventListener('dice-roll-success', handleDiceRollSuccess);
              handleLocalDiceRoll();
              dispatch(setIsRolling(false));
            }
          }, 3000);

          // Clean up timeout and event listeners when component unmounts or roll completes
          return () => {
            clearTimeout(wsTimeout);
            window.removeEventListener('dice-roll-error', handleDiceRollError);
            window.removeEventListener('dice-roll-success', handleDiceRollSuccess);
          };
        } else {
          // WebSocket not connected, use local dice roll
          // console.log('[DICE] WebSocket not connected, using local dice roll');
          handleLocalDiceRoll();
          dispatch(setIsRolling(false));
        }
      };

      // Wait for the server response, then check if it's our turn
      getCurrentTurnFromServer().then(serverCurrentTurn => {
        // If we got a response from the server, use that to determine whose turn it is
        // Otherwise, fall back to the local state
        const actualCurrentTurn = serverCurrentTurn || currentPlayer;
        const isMyTurn = socketService.localPlayerId === actualCurrentTurn;

        // console.log(`[DICE] Turn check after server validation: currentPlayer=${actualCurrentTurn}, localPlayerId=${socketService?.localPlayerId}, isMyTurn=${isMyTurn}`);

        if (!isMyTurn) {
          const currentPlayerObj = players.find(p => p.id === actualCurrentTurn);
          const currentPlayerName = currentPlayerObj?.name || "another player";

          toast({
            title: "Not your turn",
            description: `It's ${currentPlayerName}'s turn`,
            status: "warning",
            duration: 3000,
            isClosable: true,
          });
          dispatch(setIsRolling(false));
          return;
        }

        // Continue with the dice roll if it's our turn
        continueWithDiceRoll();
      }).catch(error => {
        console.error('[DICE] Error checking turn:', error);
        dispatch(setIsRolling(false));

        toast({
          title: "Error checking turn",
          description: "There was a problem communicating with the game server",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      });
    } catch (error) {
      console.error('[DICE] Error rolling dice:', error);
      dispatch(setIsRolling(false));

      toast({
        title: "Error rolling dice",
        description: error.message || "There was a problem with the game server",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Handle local dice roll when WebSocket is not available
  const handleLocalDiceRoll = () => {
    // Generate random dice values (1-6)
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const diceTotal = die1 + die2;
    const isDoubles = die1 === die2;

    // Calculate new position
    if (currentPlayerData) {
      // Get current position (default to START/position 1 if undefined)
      const currentPosition = currentPlayerData.position || 1;

      // Update the dice roll in Redux
      dispatch(updateDiceRoll({
        dice: [die1, die2],
        isDoubles,
        playerId: currentPlayerData.id
      }));

      // Show notification for doubles
      if (isDoubles) {
        const doublesCount = consecutiveDoubles + 1;
        toast({
          title: "DOUBLES!",
          description: `You rolled doubles ${doublesCount} time${doublesCount > 1 ? 's' : ''} in a row! ${doublesCount === 2 ? 'One more and you go to jail!' : ''}`,
          status: doublesCount < 3 ? "success" : "warning",
          duration: 4000,
          isClosable: true,
          position: "top"
        });

        // Check if player goes to jail (3rd consecutive doubles)
        if (doublesCount >= 3) {
          setTimeout(() => {
            animatePlayerMovement(currentPlayerData.id, currentPosition, 0, 11);
            dispatch(setIsRolling(false));
          }, 1500);

          return; // Skip normal movement
        }
      }

      // If player is in jail, handle jail logic
      if (currentPlayerData.inJail) {
        if (isDoubles) {
          // Player rolls doubles, gets out of jail
          toast({
            title: "You're free!",
            description: "You rolled doubles and got out of jail!",
            status: "success",
            duration: 3000,
            isClosable: true,
          });

          // Update player jail status
          dispatch(releaseFromJail({ playerId: currentPlayerData.id }));

          // Animate movement after jail release
          setTimeout(() => {
            // console.log(`[JAIL_RELEASE] Player ${currentPlayerData.id} rolling ${die1} + ${die2} = ${diceTotal} from jail position ${currentPosition}`);
            // Use the dice total directly for steps
            animatePlayerMovement(currentPlayerData.id, currentPosition, diceTotal);
            dispatch(setIsRolling(false));
          }, 1500);
        } else {
          // Player stays in jail, decrease jail turns
          dispatch(decrementJailTurns({ playerId: currentPlayerData.id }));

          toast({
            title: "Still in jail",
            description: `${currentPlayerData.jailTurns - 1 > 0 ? `${currentPlayerData.jailTurns - 1} turns remaining` : "You'll be released next turn"}`,
            status: "info",
            duration: 3000,
            isClosable: true,
          });

          dispatch(setIsRolling(false));
          return; // No movement when in jail
        }
      } else {
        // Normal movement animation
        // Use the dice total directly for steps, not the position difference
        // console.log(`[LOCAL_DICE] Player ${currentPlayerData.id} rolling ${die1} + ${die2} = ${diceTotal} from position ${currentPosition}`);
        animatePlayerMovement(currentPlayerData.id, currentPosition, diceTotal);
        dispatch(setIsRolling(false));
      }
    } else {
      dispatch(setIsRolling(false));
    }
  };

  // GameNotification component - displays different message types
  const GameNotification = React.memo(({ message, players }) => {
    const getPlayerName = useCallback((playerId) => {
      const player = players.find(p => p.id === playerId);
      return player ? player.name : 'Unknown Player';
    }, [players]);

    const getMessageContent = useCallback(() => {
      switch (message.type) {
        case 'ROLL':
          return (
            <Flex alignItems="center">
              <Box color="purple.500" mr={2}>
                <FaDiceFive />
              </Box>
              <Text>
                <Text as="span" fontWeight="bold">{getPlayerName(message.playerId)}</Text>
                {' rolled '}
                <Badge colorScheme="purple">{message.content.split('rolled ')[1]}</Badge>
              </Text>
            </Flex>
          );

        case 'DOUBLES':
          return (
            <Flex alignItems="center" className="doubles-message">
              <Box color="gold" mr={2} fontSize="xl">
                <FaDiceFive />
              </Box>
              <Box>
                <Text fontWeight="bold" fontSize="md">
                  <Text as="span" color="gold">DOUBLES!</Text> {getPlayerName(message.playerId)} gets another turn!
                </Text>
                <Text>
                  Rolled <Badge colorScheme="yellow" fontSize="md">({message.data.dice[0]}, {message.data.dice[1]})</Badge>
                  {message.data.consecutiveDoubles > 1 &&
                    <Text as="span" fontWeight="bold" color="orange.500"> - {message.data.consecutiveDoubles} doubles in a row!</Text>}
                </Text>
              </Box>
            </Flex>
          );

        case 'JAIL':
          return (
            <Flex alignItems="center">
              <Box color="red.500" mr={2}>
                <FaExclamationTriangle />
              </Box>
              <Text>
                <Text as="span" fontWeight="bold">{getPlayerName(message.playerId)}</Text>
                {' was sent to jail for rolling 3 consecutive doubles!'}
              </Text>
            </Flex>
          );

        case 'MOVEMENT':
          return (
            <Flex alignItems="center">
              <Box color="blue.500" mr={2}>
                <FaArrowCircleRight />
              </Box>
              <Text>
                <Text as="span" fontWeight="bold">{getPlayerName(message.playerId)}</Text>
                {' moved from '}
                <Badge colorScheme="blue">
                  {message.data.fromName || getSpaceDataByPosition(message.data.from)?.name || `Space ${message.data.from}`}
                </Badge>
                {' to '}
                <Badge colorScheme="blue">
                  {message.data.toName || getSpaceDataByPosition(message.data.to)?.name || `Space ${message.data.to}`}
                </Badge>
              </Text>
            </Flex>
          );

        case 'PROPERTY':
          return (
            <Flex alignItems="center">
              <Box color="orange.500" mr={2}>
                <FaHome />
              </Box>
              <Text>
                <Text as="span" fontWeight="bold">{getPlayerName(message.playerId)}</Text>
                {' purchased '}
                <Badge colorScheme="orange">
                  {message.data?.propertyName || 'a property'}
                </Badge>
              </Text>
            </Flex>
          );

        case 'TURN':
          return (
            <Flex alignItems="center">
              <Box color="teal.500" mr={2}>
                <FaArrowCircleRight />
              </Box>
              <Text>
                <Badge colorScheme="teal">
                  {getPlayerName(message.content.split('player ')[1])}
                </Badge>
                {' is now playing'}
              </Text>
            </Flex>
          );

        case 'EXTRA_TURN':
          return (
            <Flex alignItems="center" className="doubles-message">
              <Box color="gold" mr={2} fontSize="xl">
                <FaDiceFive />
              </Box>
              <Box>
                <Text fontWeight="bold" fontSize="md">
                  <Text as="span" color="gold">DOUBLES!</Text> {message.content}
                </Text>
              </Box>
            </Flex>
          );

        default:
          return (
            <Text>{message.content}</Text>
          );
      }
    }, [message]);

    return (
      <Box
        p={3}
        borderRadius="md"
        bg={message.type === 'EXTRA_TURN' ? 'rgba(255, 215, 0, 0.1)' : 'gray.50'}
        borderLeft="4px solid"
        borderColor={
          message.type === 'DOUBLES' ? 'yellow.500' :
          message.type === 'EXTRA_TURN' ? 'yellow.500' :
          message.type === 'ROLL' ? 'purple.500' :
          message.type === 'JAIL' ? 'red.500' :
          message.type === 'MOVEMENT' ? 'blue.500' :
          message.type === 'PROPERTY' ? 'orange.500' :
          message.type === 'TURN' ? 'teal.500' :
          'gray.500'
        }
        mb={2}
        className={message.type === 'EXTRA_TURN' ? 'game-message EXTRA_TURN' : 'game-message'}
      >
        {getMessageContent()}
        <Text fontSize="xs" color="gray.500" mt={1}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </Box>
    );
  });

  // Add this useEffect to animate movement on server-driven position changes
  useEffect(() => {
    // Only run after initial mount
    if (!players || players.length === 0) return;

    // Initialize prevPlayerPositions if empty
    if (Object.keys(prevPlayerPositions.current).length === 0) {
      players.forEach(player => {
        prevPlayerPositions.current[player.id] = player.position || 1;
      });
      return; // Skip first render to avoid unwanted animations
    }

    // Skip position tracking if a player is currently being animated
    // This prevents conflicts between the animation and position tracking
    if (animatingPlayer) {
      return;
    }

    players.forEach((player) => {
      const prevPos = prevPlayerPositions.current[player.id];
      const newPos = player.position || 1; // Default to position 1 if undefined

      // Only animate if position changed and not currently animating
      // Also check if the change is significant (more than just a small adjustment)
      if (
        prevPos !== undefined &&
        newPos !== undefined &&
        prevPos !== newPos &&
        // Skip if the player is being animated by the dice roll handler
        !window._kekopolyAnimatingPlayers?.includes(player.id)
      ) {
        // For server-initiated position changes, we need to calculate steps
        // We'll use the last dice roll if available, otherwise calculate based on positions
        let steps;

        // Check if we have a recent dice roll for this player
        const hasRecentDiceRoll = lastRoll && lastRoll.playerId === player.id &&
                                 lastRoll.timestamp && (Date.now() - lastRoll.timestamp < 5000);

        if (hasRecentDiceRoll && lastRoll.dice && lastRoll.dice.length === 2) {
          // Use the dice total for steps
          steps = lastRoll.dice[0] + lastRoll.dice[1];
        } else {
          // Fall back to position difference
          steps = newPos - prevPos;
          if (steps < 0) steps += 25; // Assuming 25 positions on board
        }

        // Check if this is a server-initiated position change (not from a local dice roll)
        // We can determine this by checking if the player is the current player and if dice were recently rolled
        const isServerInitiatedMove = !(player.id === currentPlayer && lastRoll && lastRoll.timestamp && (Date.now() - lastRoll.timestamp < 5000));

        if (isServerInitiatedMove) {
          // Track that we're animating this player to prevent duplicate animations
          window._kekopolyAnimatingPlayers = window._kekopolyAnimatingPlayers || [];
          window._kekopolyAnimatingPlayers.push(player.id);

          // Set isRolling to true during animation
          dispatch(setIsRolling(true));

          // Animate the movement
          animatePlayerMovement(player.id, prevPos, steps);

          // Reset isRolling after animation
          setTimeout(() => {
            dispatch(setIsRolling(false));

            // Remove player from animating list
            window._kekopolyAnimatingPlayers = window._kekopolyAnimatingPlayers.filter(id => id !== player.id);
          }, steps * 300 + 350);
        } else {
          // For local dice rolls, just update the ref without animation
          // The animation is handled by the dice roll handler
          prevPlayerPositions.current[player.id] = newPos;
        }
      } else {
        // Update the ref for next time even if we didn't animate
        prevPlayerPositions.current[player.id] = newPos;
      }
    });

    // Check for new players and add them to tracking
    players.forEach(player => {
      if (prevPlayerPositions.current[player.id] === undefined) {
        prevPlayerPositions.current[player.id] = player.position || 1;
      }
    });
  }, [players, dispatch, animatingPlayer, currentPlayer, lastRoll]);

  // Add a useEffect to handle automatic reconnection when no players are found
  useEffect(() => {
    // Check if we have a valid socket connection but no players
    if (socketService && socketService.socket &&
        (!uniquePlayers || uniquePlayers.length === 0) &&
        players && Array.isArray(players) && players.length > 0) {

      // console.log('[PLAYER_DEBUG] Detected missing players in uniquePlayers but players exist in raw array. Attempting auto-reconnect...');

      // Request game state and player information
      const attemptReconnection = () => {
        if (socketService.socket.readyState === WebSocket.OPEN) {
          // console.log('[PLAYER_DEBUG] Sending game state and active players requests');
          socketService.sendMessage('get_game_state', {});
          socketService.sendMessage('get_active_players', {});

          // Also try to restore player token data from localStorage
          try {
            const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
            if (storedTokenData && socketService.localPlayerId) {
              const parsedTokenData = JSON.parse(storedTokenData);

              // Send token update to server
              socketService.sendMessage('update_player_info', {
                playerId: socketService.localPlayerId,
                characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤',
                token: parsedTokenData.token || '',
                emoji: parsedTokenData.emoji || '👤',
                color: parsedTokenData.color || 'gray.500'
              });

              // console.log('[PLAYER_DEBUG] Sent stored token data to server during auto-reconnect');
            }
          } catch (e) {
            console.warn('[PLAYER_DEBUG] Error sending token data during auto-reconnect:', e);
          }
        } else {
          // console.log('[PLAYER_DEBUG] Socket not open, attempting to reconnect');
          socketService.connect(socketService.gameId, socketService.playerId, socketService.token);

          // Try again after a delay
          setTimeout(attemptReconnection, 2000);
        }
      };

      // Start the reconnection attempt
      attemptReconnection();
    }
  }, [uniquePlayers, players, socketService]);

  // Show a toast/banner for ROLL_RESULT messages
  useEffect(() => {
    if (!gameMessages || gameMessages.length === 0) return;
    const lastMsg = gameMessages[gameMessages.length - 1];
    if (lastMsg && lastMsg.type === 'ROLL_RESULT') {
      const toastId = `roll-result-toast-${lastMsg.playerId}-${lastMsg.timestamp}`;

      // Debug logs for troubleshooting
      window._kekopolyDebug = window._kekopolyDebug || {};
      window._kekopolyDebug.lastGameMessages = gameMessages;
      window._kekopolyDebug.lastRollResultMsg = lastMsg;
      // console.info('[ROLL_RESULT useEffect] Firing. gameMessages:', gameMessages);
      // console.info('[ROLL_RESULT useEffect] lastMsg:', lastMsg);

      // Extract dice values from the message if available
      let diceValues = [1, 1];
      if (lastMsg.dice && Array.isArray(lastMsg.dice) && lastMsg.dice.length === 2) {
        diceValues = lastMsg.dice;
        // console.info('[ROLL_RESULT useEffect] Using dice values from message:', diceValues);
      } else if (lastMsg.content) {
        // Try to extract dice values from content string
        const diceMatch = lastMsg.content.match(/rolled (\d+) and (\d+)/);
        if (diceMatch && diceMatch.length === 3) {
          diceValues = [parseInt(diceMatch[1]), parseInt(diceMatch[2])];
          // console.info('[ROLL_RESULT useEffect] Extracted dice values from content:', diceValues);
        }
      }

      // Update the dice roll in Redux to ensure UI consistency
      dispatch(updateDiceRoll({
        dice: diceValues,
        isDoubles: diceValues[0] === diceValues[1],
        playerId: lastMsg.playerId
      }));

      toast.close(toastId); // Close any previous with this ID
      // console.info('[ROLL_RESULT useEffect] Showing toast for dice roll:', lastMsg.content);
      toast({
        id: toastId,
        title: 'Dice Roll',
        description: lastMsg.content,
        status: 'info',
        duration: 5000,
        isClosable: true,
        position: 'top',
      });
    }
  }, [gameMessages, toast, dispatch]);

  // Show a toast/banner for jail events
  useEffect(() => {
    if (!gameMessages || gameMessages.length === 0) return;
    const lastMsg = gameMessages[gameMessages.length - 1];
    if (lastMsg && lastMsg.type === 'JAIL_EVENT') {
      toast.close('jail-event-toast'); // Close any previous
      let description = '';
      if (lastMsg.event === 'jailed') {
        description = `${lastMsg.playerName || 'A player'} was sent to Jail (Position 25) for 3 turns!`;
      } else if (lastMsg.event === 'released') {
        description = `${lastMsg.playerName || 'A player'} rolled doubles and is released from Jail!`;
      } else if (lastMsg.event === 'released_time') {
        description = `${lastMsg.playerName || 'A player'} served their time and is released from Jail!`;
      } else if (lastMsg.event === 'stay') {
        description = `${lastMsg.playerName || 'A player'} is still in Jail. ${lastMsg.jailTurns} turn(s) left.`;
      }
      toast({
        id: 'jail-event-toast',
        title: 'Jail Event',
        description,
        status: 'warning',
        duration: 5000,
        isClosable: true,
        position: 'top',
      });
    }
  }, [gameMessages, toast]);

  return (
    <Box bg="white" h="100vh" display="flex" flexDirection="column">
      {/* Header */}
      <Flex bg="#C67C5C" px={4} py={3} justify="space-between" align="center">
        <Text color="white" fontSize="xl" fontWeight="bold">
          Kekopoly
        </Text>
        <HStack spacing={4}>
          <Text color="white" fontSize="sm" px={2} py={1} bg="whiteAlpha.200" borderRadius="md">
            1.00x
          </Text>
          <IconButton
            icon={<HamburgerIcon />}
            variant="ghost"
            color="white"
            _hover={{ bg: 'whiteAlpha.200' }}
            aria-label="Menu"
          />
        </HStack>
      </Flex>

      {/* Navigation Tabs */}
      <Tabs variant="unstyled" display="flex" flexDirection="column" flex={1}>
        <TabList bg="#C67C5C" display="flex" width="100%">
          <Tab
            _selected={{ bg: 'white', color: 'black' }}
            color="white"
            borderTopRadius="md"
            px={isMobile ? 3 : 6}
            py={2}
            flex={1}
            textAlign="center"
            fontSize={isMobile ? "sm" : "md"}
          >
            Board
          </Tab>
          <Tab
            _selected={{ bg: 'white', color: 'black' }}
            color="white"
            borderTopRadius="md"
            px={isMobile ? 3 : 6}
            py={2}
            flex={1}
            textAlign="center"
            fontSize={isMobile ? "sm" : "md"}
          >
            Players
          </Tab>
          <Tab
            _selected={{ bg: 'white', color: 'black' }}
            color="white"
            borderTopRadius="md"
            px={isMobile ? 3 : 6}
            py={2}
            flex={1}
            textAlign="center"
            fontSize={isMobile ? "sm" : "md"}
          >
            Properties
          </Tab>
          <Tab
            _selected={{ bg: 'white', color: 'black' }}
            color="white"
            borderTopRadius="md"
            px={isMobile ? 3 : 6}
            py={2}
            flex={1}
            textAlign="center"
            fontSize={isMobile ? "sm" : "md"}
          >
            Log
          </Tab>
        </TabList>

        <TabPanels flex={1} display="flex" flexDirection="column">
          <TabPanel p={0} display="flex" flexDirection="column" flex={1} key="board-tab" h="100%">
            {/* Game Board Image with clickable spaces */}
            <Box
              flex={1}
              bg="#F5F7E9"
              p={{ base: 1, sm: 2, md: 3 }}
              position="relative"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
            >
              {/* Responsive board container with preserved aspect ratio */}
              <Box
                width="100%"
                height="100%"
                display="flex"
                alignItems="center"
                justifyContent="center"
                overflow="hidden"
              >
                <AspectRatio
                  ratio={1}
                  width={isMobile ? "100%" : "min(100%, 90vh)"}
                  height={isMobile ? "auto" : "min(100%, 90vh)"}
                  ref={boardContainerRef}
                  margin="auto"
                >
                  <Box position="relative">
                    <Image
                      src={gameBoardImage}
                      alt="Kekopoly Game Board"
                      width="100%"
                      height="100%"
                      objectFit="contain"
                      fallbackSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                    />

                    {/* Clickable overlay spaces for properties */}
                    {Object.entries(updatedBoardCoordinates).map(([positionIndex, coords]) => {
                      const space = getSpaceDataByPosition(positionIndex);
                      if (!space) return null;

                      return (
                        <Popover key={positionIndex} trigger="click" placement="auto">
                          <PopoverTrigger>
                            <Box
                              position="absolute"
                              left={`${coords.left}%`}
                              top={`${coords.top}%`}
                              width={`${coords.width}%`}
                              height={`${coords.height}%`}
                              cursor="pointer"
                              bg="transparent"
                              _hover={{ bg: "rgba(255, 255, 255, 0.15)" }}
                              onClick={() => handlePropertyClick(positionIndex)}
                              zIndex={5}
                            />
                          </PopoverTrigger>
                          <PopoverContent width="auto" maxW={isMobile ? "200px" : "250px"}>
                            <PopoverArrow />
                            <PopoverCloseButton />
                            <PopoverHeader fontWeight="bold" bg={space.color ? `${space.color}.100` : "gray.100"}>
                              {space.name}
                            </PopoverHeader>
                            <PopoverBody>
                              <VStack align="start" spacing={2}>
                                {useMemo(() => {
                                  const details = getPropertyDetails(space) || [];
                                  return details.map((detail, idx) => (
                                    <HStack key={idx} width="100%" justifyContent="space-between">
                                      <Text fontWeight="semibold" fontSize={isMobile ? "xs" : "sm"}>{detail.label}:</Text>
                                      <Text fontSize={isMobile ? "xs" : "sm"}>{detail.value}</Text>
                                    </HStack>
                                  ));
                                }, [space, isMobile])}

                                {/* Owner information if applicable */}
                                {space.propertyId && (
                                  <Box width="100%" mt={2} pt={2} borderTopWidth="1px">
                                    <HStack justifyContent="space-between">
                                      <Text fontWeight="semibold" fontSize={isMobile ? "xs" : "sm"}>Owner:</Text>
                                      {useMemo(() => {
                                        const owner = getPropertyOwner(space.position);
                                        return owner ? (
                                          <HStack>
                                            <Box w={3} h={3} borderRadius="full" bg={owner.color} />
                                            <Text fontSize={isMobile ? "xs" : "sm"}>{owner.name}</Text>
                                          </HStack>
                                        ) : (
                                          <Text color="gray.500" fontSize={isMobile ? "xs" : "sm"}>Unowned</Text>
                                        );
                                      }, [space.position, currentBoardState])}
                                    </HStack>
                                  </Box>
                                )}
                              </VStack>
                            </PopoverBody>
                          </PopoverContent>
                        </Popover>
                      );
                    })}

                    {/* Player Tokens on Board - Optimized rendering */}
                    {startCoords && uniquePlayers && uniquePlayers.length > 0 ? (
                        // Use React.memo for player tokens to prevent unnecessary re-renders
                        uniquePlayers.map((player, index) => {
                            if (!player) {
                                return null;
                            }

                            // Get token from player data - try multiple properties
                            // First check characterToken, then token, then emoji
                            let playerToken = player.characterToken || player.token || player.emoji || ':)';

                            // Only try to get token from localStorage for local player once
                            if (player.id === socketService?.localPlayerId && !player._tokenInitialized) {
                                try {
                                    const storedTokenData = localStorage.getItem('kekopoly_player_token_data');
                                    if (storedTokenData) {
                                        const parsedTokenData = JSON.parse(storedTokenData);

                                        if (parsedTokenData.token || parsedTokenData.emoji) {
                                            playerToken = parsedTokenData.token || parsedTokenData.emoji || playerToken;

                                            // Only update Redux if token is different
                                            if (playerToken !== player.token && playerToken !== player.characterToken) {
                                                dispatch(updatePlayer({
                                                    playerId: player.id,
                                                    updates: {
                                                        token: parsedTokenData.token || '',
                                                        emoji: parsedTokenData.emoji || '👤',
                                                        color: parsedTokenData.color || 'gray.500',
                                                        characterToken: parsedTokenData.token || parsedTokenData.emoji || '👤',
                                                        _tokenInitialized: true
                                                    }
                                                }));
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Silent error handling
                                }
                            }

                            // If we still don't have a token, use a consistent default based on player ID
                            if ((!playerToken || playerToken === ':)') && !player._tokenInitialized) {
                                // Use a deterministic approach to assign tokens based on player ID
                                const emojiOptions = ['👤', '🐸', '💪', '😢', '🐕', '🐱', '👹', '🌕', '🚀'];

                                // Simple hash based on first characters of ID
                                const playerIndex = Math.abs(player.id.charCodeAt(0) +
                                                   (player.id.charCodeAt(1) || 0)) % emojiOptions.length;
                                playerToken = emojiOptions[playerIndex];

                                // Update Redux with the assigned token to ensure consistency
                                dispatch(updatePlayer({
                                    playerId: player.id,
                                    updates: {
                                        token: playerToken,
                                        emoji: playerToken,
                                        characterToken: playerToken,
                                        _tokenInitialized: true
                                    }
                                }));

                                // Also send to server if this is the local player
                                if (player.id === socketService?.localPlayerId && socketService && socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
                                    socketService.sendMessage('update_player_info', {
                                        playerId: player.id,
                                        characterToken: playerToken,
                                        emoji: playerToken,
                                        token: playerToken
                                    });
                                }
                            }

                            // Use the map, fall back by looking up the :) emoji key
                            let tokenImg = tokenImageMap[playerToken] || tokenImageMap[':)'] || tokenPepe;

                            // Add a final check in case even fallback isn't mapped or image fails
                            if (!tokenImg) {
                                // Always use tokenPepe as a last resort to ensure player is visible
                                tokenImg = tokenPepe;

                                // Update the token map for future use
                                tokenImageMap[playerToken] = tokenPepe;
                            }

                            // Get player position
                            const playerPosition = player.position || 1; // Default to START (position 1)

                            // If this player is being animated, use the animation position instead
                            const isAnimating = player.id === animatingPlayer;
                            const displayPosition = isAnimating && animationPath.length > 0 ?
                                                  animationPath[Math.min(animationStep, animationPath.length - 1)] : playerPosition;

                            // Calculate token position
                            let tokenLeft, tokenTop, tokenSize;

                            // Determine consistent token size based on number of players
                            const playerCount = uniquePlayers.length;
                            const gridSize = Math.ceil(Math.sqrt(playerCount));
                            // Use a consistent token size regardless of position
                            tokenSize = gridSize <= 2 ? (isMobile ? 3.5 : 4.5) : (isMobile ? 2.5 : 3.5);

                            // Use the exact coordinates for START position (position 1)
                            if (displayPosition === 1) {
                                // Calculate starting position for player tokens at START
                                const baseLeft = 5.5;  // Fixed START position (left)
                                const baseTop = 23.0;  // Fixed START position (top)

                                // Position in the grid (0-based)
                                const gridX = index % gridSize;
                                const gridY = Math.floor(index / gridSize);

                                // Adjust spacing based on number of players
                                const spacing = gridSize <= 2 ? 2.0 : 1.5;

                                // Calculate final position
                                tokenLeft = `${baseLeft + (gridX * spacing * tokenSize / 4)}%`;
                                tokenTop = `${baseTop + (gridY * spacing * tokenSize / 4)}%`;
                            } else {
                                // For positions other than START, get the space coordinates
                                const positionCoords = updatedBoardCoordinates[displayPosition.toString()];

                                if (!positionCoords) {
                                    return null;
                                }

                                // Calculate the center of the space
                                const centerX = parseFloat(positionCoords.left) + parseFloat(positionCoords.width) / 2;
                                const centerY = parseFloat(positionCoords.top) + parseFloat(positionCoords.height) / 2;

                                // Multiple players on same space layout - account for animated positions
                                const playersAtThisPosition = uniquePlayers.filter(p => {
                                  // Get this player's displayed position
                                  const isPlayerAnimating = p.id === animatingPlayer;
                                  const playerDisplayPosition = isPlayerAnimating && animationPath.length > 0 ?
                                                           animationPath[Math.min(animationStep, animationPath.length - 1)] : (p.position || 1);
                                  return playerDisplayPosition === displayPosition;
                                });

                                const spaceGridSize = Math.ceil(Math.sqrt(playersAtThisPosition.length));

                                // Position within multi-player grid
                                const positionIndex = playersAtThisPosition.findIndex(p => p.id === player.id);

                                // Calculate offset from center
                                const spacing = spaceGridSize <= 2 ? 2.0 : 1.5;
                                const offsetX = (positionIndex % spaceGridSize - (spaceGridSize - 1) / 2) * (tokenSize * spacing / 2);
                                const offsetY = (Math.floor(positionIndex / spaceGridSize) - (spaceGridSize - 1) / 2) * (tokenSize * spacing / 2);

                                // Final position
                                tokenLeft = `${centerX - tokenSize/2 + offsetX}%`;
                                tokenTop = `${centerY - tokenSize/2 + offsetY}%`;
                            }

                            return (
                                <Image
                                    key={`player-token-${player.id}-${index}`}
                                    src={tokenImg}
                                    alt={`${player.name || 'Player'} token`}
                                    position="absolute"
                                    left={tokenLeft}
                                    top={tokenTop}
                                    width={`${tokenSize || (isMobile ? 3 : 4)}%`}
                                    height="auto"
                                    zIndex={10}
                                    title={player.name}
                                    pointerEvents="none"
                                    borderRadius="full"
                                    bg="white"
                                    p={1}
                                    sx={player.id === currentPlayer ? currentPlayerToken : {
                                      border: "2px solid",
                                      borderColor: player.color || "red"
                                    }}
                                    transition="all 0.3s ease-in-out"
                                    fallback={
                                        <Box
                                            position="absolute"
                                            left={tokenLeft}
                                            top={tokenTop}
                                            width={`${tokenSize || (isMobile ? 3 : 4)}%`}
                                            height={`${tokenSize || (isMobile ? 3 : 4)}%`}
                                            borderRadius="full"
                                            bg={player.color || "red.500"}
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            color="white"
                                            fontWeight="bold"
                                            fontSize={`${tokenSize/3}vw`}
                                            zIndex={10}
                                            sx={player.id === currentPlayer ? currentPlayerToken : {
                                              border: "2px solid",
                                              borderColor: "white"
                                            }}
                                        >
                                            {player.name ? player.name.charAt(0) : "P"}
                                        </Box>
                                    }
                                />
                            );
                        })
                    ) : (
                        <Box position="absolute" top="10px" left="10px" bg="rgba(255,255,255,0.9)" p={3} borderRadius="md" zIndex={5} boxShadow="md">
                            <Text color="red.500" fontWeight="bold" fontSize="md">
                                No players found on game board
                            </Text>
                            <Text fontSize="sm" color="gray.700" mt={1}>
                                {players && Array.isArray(players) && players.length > 0 ?
                                    `Raw player count: ${players.length}. Attempting to fix display...` :
                                    'No player data available. Please try reconnecting.'}
                            </Text>

                            {/* Show connection status */}
                            <HStack mt={2} spacing={2} align="center">
                                <Box
                                    w={3}
                                    h={3}
                                    borderRadius="full"
                                    bg={socketService?.socket?.readyState === WebSocket.OPEN ? "green.500" : "red.500"}
                                />
                                <Text fontSize="xs" color="gray.600">
                                    WebSocket: {socketService?.socket?.readyState === WebSocket.OPEN ? "Connected" : "Disconnected"}
                                </Text>
                            </HStack>

                            {/* Auto-fix attempt message */}
                            <Text fontSize="xs" color="blue.600" mt={1}>
                                Auto-fix attempt in progress...
                            </Text>

                            <HStack mt={3} spacing={2}>
                                <Button
                                    size="sm"
                                    colorScheme="blue"
                                    flex={1}
                                    onClick={() => {
                                        // Force reconnection to the game
                                        if (socketService) {
                                            // console.log('[PLAYER_DEBUG] Forcing reconnection to game');

                                            // First try to reconnect the socket
                                            if (socketService.socket && socketService.socket.readyState !== WebSocket.OPEN) {
                                                socketService.connect(socketService.gameId, socketService.playerId, socketService.token);
                                            }

                                            // Then request game state update
                                            setTimeout(() => {
                                                if (socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
                                                    socketService.sendMessage('get_game_state', { full: true });
                                                    socketService.sendMessage('get_active_players', {});

                                                    // Show toast notification
                                                    toast({
                                                        title: "Reconnection attempt",
                                                        description: "Requesting fresh game data from server...",
                                                        status: "info",
                                                        duration: 3000,
                                                        isClosable: true,
                                                    });
                                                }
                                            }, 500);
                                        }
                                    }}
                                >
                                    Reconnect
                                </Button>

                                <Button
                                    size="sm"
                                    colorScheme="red"
                                    variant="outline"
                                    flex={1}
                                    onClick={() => {
                                        // Refresh the page
                                        window.location.reload();
                                    }}
                                >
                                    Refresh Page
                                </Button>
                            </HStack>

                            {/* Auto-fix attempt */}
                            {players && Array.isArray(players) && players.length > 0 && (
                                <Box mt={3} p={2} bg="gray.100" borderRadius="md">
                                    <Text fontSize="xs" fontWeight="bold">Auto-fix in progress</Text>
                                    <Text fontSize="xs">
                                        Found {players.length} players in data but display is not updating.
                                        Attempting to force update...
                                    </Text>
                                    {/* Auto-fix button instead of automatic IIFE */}
                                    <Button
                                        size="xs"
                                        colorScheme="blue"
                                        mt={2}
                                        onClick={() => {
                                            // console.log('[PLAYER_DEBUG] Auto-fix: Force adding all players to Redux');
                                            players.forEach(player => {
                                                if (player && player.id) {
                                                    dispatch(addPlayer({
                                                        playerId: player.id,
                                                        playerData: player
                                                    }));
                                                }
                                            });

                                            // Request active players again
                                            if (socketService?.socket?.readyState === WebSocket.OPEN) {
                                                socketService.sendMessage('get_active_players', {});
                                                socketService.sendMessage('get_game_state', { full: true });
                                            }
                                        }}
                                    >
                                        Force Sync Players
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    )}
                  </Box>
                </AspectRatio>
              </Box>
            </Box>

            {/* Current Player Info */}
            <Box bg="white" p={{ base: 2, md: 4 }} boxShadow="0 -1px 3px rgba(0,0,0,0.1)">
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontWeight="bold" fontSize="lg">Current Player</Text>
                <HStack
                  p={2}
                  borderRadius="md"
                  bg={socketService?.isLocalPlayerTurn?.() ? "green.50" : "gray.50"}
                  borderWidth="1px"
                  borderColor={socketService?.isLocalPlayerTurn?.() ? "green.200" : "gray.200"}
                >
                  <Box
                    w={4}
                    h={4}
                    borderRadius="full"
                    bg={players.find(p => p.id === currentPlayer)?.color || "green.500"}
                    sx={socketService?.isLocalPlayerTurn?.() ? { boxShadow: '0 0 5px green' } : {}}
                  />
                  <Text fontWeight="bold">{players.find(p => p.id === currentPlayer)?.name || "Player"}</Text>
                  {socketService?.isLocalPlayerTurn?.() ? (
                    <Badge colorScheme="green" ml={2} p={1} borderRadius="md" sx={currentTurnIndicator}>
                      YOUR TURN
                    </Badge>
                  ) : (
                    <Badge colorScheme="red" ml={2} p={1} borderRadius="md">
                      Waiting
                    </Badge>
                  )}
                </HStack>
              </Flex>

              <Flex justify="space-between" mb={3} flexWrap={{ base: "wrap", md: "nowrap" }}>
                <HStack spacing={{ base: 4, md: 8 }} mb={{ base: 2, md: 0 }}>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Kekels:</Text>
                    <Text fontWeight="bold">{currentPlayerData?.balance || 1500}</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Properties:</Text>
                    <Text fontWeight="bold">{currentPlayerData?.properties?.length || 0}</Text>
                  </Box>
                </HStack>
                <Box>
                  <Text color="gray.600" fontSize="sm">Position:</Text>
                  <Text fontWeight="bold">
                    {currentPlayerData?.position !== undefined
                      ? getSpaceName(currentPlayerData.position)
                      : 'START'}
                  </Text>
                </Box>
              </Flex>

              {/* Game Controls */}
              <Flex gap={2}>
                <Button
                  flex={1}
                  bg="#C67C5C"
                  color="white"
                  _hover={{ bg: '#B56B4B' }}
                  size={{ base: "md", md: "lg" }}
                  onClick={() => {
                    // Double-check with the server before allowing the roll
                    if (socketService && socketService.socket && socketService.socket.readyState === WebSocket.OPEN) {
                      // Request the current turn from the server
                      socketService.sendMessage('get_current_turn', {});

                      // Wait a short time for the server to respond
                      setTimeout(() => {
                        // Get the latest state from Redux
                        const latestState = store.getState();
                        const latestCurrentPlayer = latestState.game.currentPlayer;
                        const isStillMyTurn = socketService.localPlayerId === latestCurrentPlayer;

                        // console.log(`[DICE_BUTTON] Final turn check: currentPlayer=${latestCurrentPlayer}, localPlayer=${socketService.localPlayerId}, isMyTurn=${isStillMyTurn}`);

                        if (isStillMyTurn) {
                          // It's definitely our turn, proceed with the roll
                          handleRollDice();
                        } else {
                          // It's not our turn, show an error
                          const currentPlayerObj = players.find(p => p.id === latestCurrentPlayer);
                          const currentPlayerName = currentPlayerObj?.name || "another player";

                          toast({
                            title: "Not your turn",
                            description: `It's ${currentPlayerName}'s turn to roll the dice`,
                            status: "warning",
                            duration: 3000,
                            isClosable: true,
                          });
                        }
                      }, 200);
                    } else {
                      // Socket not connected, use local dice roll
                      // console.log('[DICE_BUTTON] Socket not connected, using local dice roll');
                      handleLocalDiceRoll();
                    }
                  }}
                  isLoading={isRolling}
                  loadingText="Rolling..."
                  isDisabled={isRolling || !socketService?.isLocalPlayerTurn?.()}
                  title={!socketConnected ? "Using local dice roll (offline mode)" :
                         !socketService?.isLocalPlayerTurn?.() ? "Not your turn" : "Roll dice"}
                  opacity={!socketService?.isLocalPlayerTurn?.() ? 0.6 : 1}
                >
                  {!socketConnected ? "Roll Dice (Offline Mode)" : "Roll Dice"}
                </Button>
                <Button
                  flex={1}
                  bg="#B4BD4D"
                  color="white"
                  _hover={{ bg: '#A3AC3C' }}
                  size={{ base: "md", md: "lg" }}
                  onClick={() => {
                    if (socketService?.isLocalPlayerTurn?.()) {
                      socketService.endTurn();
                      dispatch(endTurn());
                    } else {
                      toast({
                        title: "Not your turn",
                        description: "You can only end your own turn",
                        status: "warning",
                        duration: 3000,
                        isClosable: true,
                      });
                    }
                  }}
                  isDisabled={isRolling || !socketService?.isLocalPlayerTurn?.()}
                  opacity={!socketService?.isLocalPlayerTurn?.() ? 0.6 : 1}
                >
                  End Turn
                </Button>
              </Flex>

              {/* Turn Status Alert */}
              {socketService?.isLocalPlayerTurn?.() ? (
                <Alert status="success" mt={3} borderRadius="md" variant="solid">
                  <AlertIcon />
                  <AlertTitle mr={2} fontWeight="bold">Your Turn!</AlertTitle>
                  <AlertDescription>Roll the dice to move your token</AlertDescription>
                </Alert>
              ) : (
                <Alert status="info" mt={3} borderRadius="md" variant="solid">
                  <AlertIcon />
                  <AlertTitle mr={2} fontWeight="bold">Waiting for turn</AlertTitle>
                  <AlertDescription>It's {players.find(p => p.id === currentPlayer)?.name || "another player"}'s turn to roll</AlertDescription>
                </Alert>
              )}
            </Box>
          </TabPanel>

          <TabPanel key="players-tab">
            <Box p={4}>
              {useMemo(() => {
                return players.map((player, index) => (
                  <HStack key={`player-${player.id}-${index}`} justify="space-between" p={4} bg="gray.50" borderRadius="md" mb={2}>
                    <HStack>
                      <Box w={3} h={3} borderRadius="full" bg={player.color} />
                      <Text>{player.name}</Text>
                    </HStack>
                    <Text>{player.balance} Kekels</Text>
                  </HStack>
                ));
              }, [players])}
            </Box>
          </TabPanel>

          <TabPanel key="properties-tab" flex={1}>
            <VStack p={4} align="stretch" spacing={4}>
              {useMemo(() => {
                return ownableSpaces.map(spaceConfig => {
                  const propertyData = properties[spaceConfig.propertyId];
                  const owner = getPropertyOwner(spaceConfig.position);
                  const isMortgaged = currentBoardState.find(s => s.id === spaceConfig.position)?.mortgaged;

                  return (
                    <Box key={spaceConfig.position} p={4} bg="gray.50" borderRadius="md" borderWidth="1px">
                      <HStack justify="space-between">
                        <Text fontWeight="bold" color={propertyData?.group || 'black'}>{spaceConfig.name}</Text>
                        <Text fontSize="sm">Price: {propertyData?.cost || 0} Kekels</Text>
                      </HStack>
                      <Divider my={2} />
                      <HStack justify="space-between">
                        <Text fontSize="sm">Owner:</Text>
                        {owner ? (
                          <HStack>
                             <Box w={3} h={3} borderRadius="full" bg={owner.color || 'gray.300'} />
                             <Text fontSize="sm">{owner.name}</Text>
                          </HStack>
                        ) : (
                          <Text fontSize="sm" color="gray.500">Unowned</Text>
                        )}
                        {isMortgaged && <Badge colorScheme="red">Mortgaged</Badge>}
                      </HStack>
                    </Box>
                  );
                });
              }, [ownableSpaces, currentBoardState, getPropertyOwner])}
            </VStack>
          </TabPanel>

          <TabPanel key="log-tab">
            <Box p={4}>
              {useMemo(() => {
                return gameMessages.map((message, index) => (
                  <GameNotification key={index} message={message} players={players} />
                ));
              }, [gameMessages, players])}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Property Purchase Modal */}
      <Modal isOpen={showPurchaseModal && !!purchaseProperty} onClose={() => { setShowPurchaseModal(false); setPurchaseProperty(null); purchaseDisclosure.onClose(); }} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Buy Property</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {purchaseProperty && useMemo(() => {
              const propertyGroup = properties[purchaseProperty.propertyId]?.group || "gray";
              const bgColor = `${propertyGroup}.50`;
              const borderColor = `${propertyGroup}.500`;
              const cost = properties[purchaseProperty.propertyId]?.cost || 0;
              const baseRent = properties[purchaseProperty.propertyId]?.rent?.[0] || 0;

              return (
                <VStack align="start" spacing={3}>
                  <Text fontWeight="bold" fontSize="lg">{purchaseProperty.name}</Text>

                  {/* Property details */}
                  <Box
                    p={3}
                    bg={bgColor}
                    borderRadius="md"
                    w="100%"
                    borderLeft="8px solid"
                    borderLeftColor={borderColor}
                  >
                    <Text fontSize="lg" fontWeight="bold" mb={2}>
                      Price: <b>{cost} Kekels</b>
                    </Text>

                    <HStack justify="space-between" mb={1}>
                      <Text>Base Rent:</Text>
                      <Text fontWeight="bold">{baseRent} Kekels</Text>
                    </HStack>

                  <HStack justify="space-between" mb={1}>
                    <Text>Color Group:</Text>
                    <Badge colorScheme={propertyGroup}>
                      {propertyGroup || 'N/A'}
                    </Badge>
                  </HStack>

                  <HStack justify="space-between">
                    <Text>Mortgage Value:</Text>
                    <Text>{properties[purchaseProperty.propertyId]?.mortgage || 0} Kekels</Text>
                  </HStack>
                </Box>

                <Text fontSize="sm" color="gray.600">
                  Purchasing this property will allow you to collect rent from other players who land on it.
                </Text>

                {currentPlayerData && (
                  <HStack justify="space-between" w="100%" mt={2}>
                    <Text>Your Balance:</Text>
                    <Text fontWeight="bold">{currentPlayerData.balance} Kekels</Text>
                  </HStack>
                )}
              </VStack>
              );
            }, [purchaseProperty, properties, currentPlayerData])}
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="green" mr={3} onClick={handleBuyProperty} isLoading={isBuying} isDisabled={isBuying}>
              Buy
            </Button>
            <Button variant="ghost" onClick={() => { setShowPurchaseModal(false); setPurchaseProperty(null); purchaseDisclosure.onClose(); }}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
});

export default GameBoard;