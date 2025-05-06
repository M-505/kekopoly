import { Box, Heading, Text, HStack, VStack, Badge, Avatar, Flex, Progress, SimpleGrid } from '@chakra-ui/react';
import { useSelector } from 'react-redux';
import socketService from '../../services/socketService';

/**
 * PlayerDashboard component
 * Displays information about the current player and other players in the game
 */
const PlayerDashboard = ({ currentPlayer = null, showAllPlayers = false }) => {
  // In a real implementation, we would use Redux selectors to get this data
  // const currentPlayer = useSelector(state => {
  //   const localPlayerId = state.players.localPlayerId;
  //   return localPlayerId ? state.players.players[localPlayerId] : null;
  // });
  // const players = useSelector(state => state.players.players);
  // const currentTurn = useSelector(state => state.game.currentTurn);

  // For demo purposes
  const players = {
    'player1': {
      playerId: 'player1',
      userId: 'user1',
      characterToken: 'pepe',
      status: 'ACTIVE',
      balance: 2000,
      position: 0,
      properties: ['property1', 'property2'],
      cards: [{
        cardId: 'card1',
        cardType: 'MEME',
        rarity: 'COMMON',
        name: 'Stonks'
      }],
      shadowbanned: false,
      color: 'green.500'
    },
    'player2': {
      playerId: 'player2',
      userId: 'user2',
      characterToken: 'wojak',
      status: 'ACTIVE',
      balance: 1800,
      position: 5,
      properties: ['property3'],
      cards: [],
      shadowbanned: false,
      color: 'blue.500'
    }
  };
  
  const currentTurn = 'player1';

  // Character token mapping
  const characterImages = {
    'pepe': '🐸',
    'wojak': '😢',
    'doge': '🐶',
    'chad': '👨‍💼',
  };

  // Get character emoji or default
  const getCharacterEmoji = (character) => {
    return characterImages[character] || '👤';
  };

  // Format player status with appropriate styling
  const renderPlayerStatus = (status, isShadowbanned) => {
    if (isShadowbanned) {
      return <Badge colorScheme="gray">Shadowbanned</Badge>;
    }
    
    switch (status) {
      case 'ACTIVE':
        return <Badge colorScheme="green">Active</Badge>;
      case 'DISCONNECTED':
        return <Badge colorScheme="red">Disconnected</Badge>;
      case 'BANKRUPT':
        return <Badge colorScheme="red">Bankrupt</Badge>;
      case 'FORFEITED':
        return <Badge colorScheme="gray">Forfeited</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Current player dashboard
  const renderCurrentPlayerDashboard = () => {
    if (!currentPlayer) return null;
    
    return (
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Avatar bg={currentPlayer.color || "green.500"} size="md" name={currentPlayer.characterToken}>
            {getCharacterEmoji(currentPlayer.characterToken)}
          </Avatar>
          <Box>
            <Heading size="md">{currentPlayer.characterToken || "Player"}</Heading>
            <HStack>
              {renderPlayerStatus(currentPlayer.status, currentPlayer.shadowbanned)}
              {currentTurn === socketService.playerId && (
                <Badge colorScheme="purple">Your Turn</Badge>
              )}
            </HStack>
          </Box>
        </HStack>

        <SimpleGrid columns={3} spacing={4} width="100%">
          <Box bg="white" p={2} borderRadius="md" textAlign="center">
            <Text fontSize="xs" color="gray.500">Balance</Text>
            <Text fontSize="lg" fontWeight="bold">{currentPlayer.balance} K</Text>
          </Box>
          <Box bg="white" p={2} borderRadius="md" textAlign="center">
            <Text fontSize="xs" color="gray.500">Properties</Text>
            <Text fontSize="lg" fontWeight="bold">{currentPlayer.properties?.length || 0}</Text>
          </Box>
          <Box bg="white" p={2} borderRadius="md" textAlign="center">
            <Text fontSize="xs" color="gray.500">Cards</Text>
            <Text fontSize="lg" fontWeight="bold">{currentPlayer.cards?.length || 0}</Text>
          </Box>
        </SimpleGrid>

        {currentPlayer.shadowbanned && (
          <Box mt={2}>
            <Text fontSize="sm">Shadowban ends in: {currentPlayer.shadowbanRemainingTurns} turns</Text>
            <Progress value={100 - (currentPlayer.shadowbanRemainingTurns * 33)} colorScheme="gray" size="sm" mt={1} />
          </Box>
        )}
      </VStack>
    );
  };

  // Render all other players
  const renderOtherPlayers = () => {
    if (!showAllPlayers) return null;
    
    return (
      <VStack align="stretch" spacing={2} mt={6}>
        <Heading size="sm">Other Players</Heading>
        {Object.values(players)
          .filter(player => currentPlayer && player.playerId !== currentPlayer.playerId)
          .map(player => (
            <Flex 
              key={player.playerId} 
              p={2} 
              bg="whiteAlpha.200" 
              borderRadius="md" 
              justify="space-between"
              align="center"
            >
              <HStack>
                <Avatar bg={player.color || "blue.500"} size="xs">
                  {getCharacterEmoji(player.characterToken)}
                </Avatar>
                <Text fontSize="sm">{player.characterToken}</Text>
                {currentTurn === player.playerId && (
                  <Badge colorScheme="purple" size="sm">Turn</Badge>
                )}
              </HStack>
              <HStack>
                <Text fontSize="sm" fontWeight="bold">{player.balance} K</Text>
                <Text fontSize="xs" color="gray.500">
                  {player.properties?.length || 0} props
                </Text>
              </HStack>
            </Flex>
          ))}
      </VStack>
    );
  };

  return (
    <Box p={4} bg="brand.50" borderRadius="md" boxShadow="sm">
      {renderCurrentPlayerDashboard()}
      {renderOtherPlayers()}
    </Box>
  );
};

export default PlayerDashboard;