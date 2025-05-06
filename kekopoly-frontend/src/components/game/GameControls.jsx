import React from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  useToast,
  Badge,
} from '@chakra-ui/react';
import { useSelector, useDispatch } from 'react-redux';
import {
  startGameAsync,
  endGame,
} from '../../store/gameSlice';
import { setPlayerReady } from '../../store/playerSlice';

const GameControls = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const { gameStarted, gamePhase, currentPlayer, players } = useSelector((state) => state.game);
  const isHost = useSelector((state) => {
    const player = state.game.players.find(p => p.id === currentPlayer);
    return player?.isHost || false;
  });

  const handleReady = () => {
    dispatch(setPlayerReady({ playerId: currentPlayer, isReady: true }));
    toast({
      title: "Ready!",
      description: "You are now ready to play",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
  };

  const handleStartGame = async () => {
    try {
      await dispatch(startGameAsync());
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  const handleEndGame = () => {
    dispatch(endGame());
  };

  return (
    <Box p={4} bg="white" borderRadius="lg" boxShadow="md">
      <VStack spacing={4}>
        <Text fontSize="lg" fontWeight="bold">
          Game Controls
        </Text>
        
        <HStack spacing={4}>
          {!gameStarted && gamePhase === 'setup' && (
            <Button colorScheme="green" onClick={handleStartGame}>
              Start Game
            </Button>
          )}
          
          {gameStarted && (
            <Button colorScheme="red" onClick={handleEndGame}>
              End Game
            </Button>
          )}
        </HStack>

        {currentPlayer && (
          <Text>
            Current Player: {players.find(p => p.id === currentPlayer)?.name}
          </Text>
        )}
      </VStack>
    </Box>
  );
};

export default GameControls; 