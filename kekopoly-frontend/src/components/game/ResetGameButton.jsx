import React, { useState } from 'react';
import { Button, useToast } from '@chakra-ui/react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ResetGameButton = () => {
  const { gameId } = useParams();
  const [isResetting, setIsResetting] = useState(false);
  const toast = useToast();
  const { token } = useSelector((state) => state.auth);

  const handleResetGame = async () => {
    if (!gameId) return;

    setIsResetting(true);
    try {
      // Ensure token is properly formatted
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      // Call the backend API to reset the game status
      const response = await fetch(`/api/v1/games/${gameId}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        toast({
          title: 'Game Reset',
          description: 'Game has been reset to LOBBY status. You can now join it again.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        // Reload the page to reflect the changes
        window.location.reload();
      } else {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || 'Failed to reset the game');
      }
    } catch (error) {
      console.error('Failed to reset game:', error);
      toast({
        title: 'Reset Failed',
        description: error.message || 'Failed to reset the game. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Button
      colorScheme="red"
      onClick={handleResetGame}
      isLoading={isResetting}
      loadingText="Resetting..."
      size="md"
      width="full"
      mt={4}
    >
      Reset Abandoned Game
    </Button>
  );
};

export default ResetGameButton;
