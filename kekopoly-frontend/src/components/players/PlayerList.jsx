import { Box, Flex, Text, Badge, Avatar, VStack, HStack } from '@chakra-ui/react';
import { useSelector } from 'react-redux';

const PlayerList = ({ players, currentPlayer }) => {
  const board = useSelector(state => state.game.board);

  const getPlayerProperties = (playerId) => {
    return board.filter(space => space.owner === playerId);
  };

  const getPlayerPosition = (position) => {
    const space = board[position];
    return space ? space.name : 'Unknown';
  };

  return (
    <Box
      p={4}
      bg="white"
      borderRadius="md"
      boxShadow="sm"
      width="100%"
    >
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        Players
      </Text>
      
      <VStack spacing={4} align="stretch">
        {players.map(player => {
          const properties = getPlayerProperties(player.id);
          const currentPosition = getPlayerPosition(player.position);
          
          return (
            <Box
              key={player.id}
              p={3}
              bg={player.id === currentPlayer ? 'brand.50' : 'gray.50'}
              borderRadius="md"
              border="1px solid"
              borderColor={player.id === currentPlayer ? 'brand.200' : 'gray.200'}
            >
              <Flex justify="space-between" align="center">
                <HStack spacing={3}>
                  <Avatar
                    size="sm"
                    name={player.name}
                    src={player.avatar}
                    bg={player.color}
                  />
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="bold">
                      {player.name}
                      {player.id === currentPlayer && (
                        <Badge ml={2} colorScheme="green">
                          Current Turn
                        </Badge>
                      )}
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      {currentPosition}
                    </Text>
                  </VStack>
                </HStack>
                
                <VStack align="end" spacing={0}>
                  <Text fontWeight="bold" color="brand.500">
                    {player.balance} Kekels
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    {properties.length} Properties
                  </Text>
                </VStack>
              </Flex>
              
              {player.inJail && (
                <Badge colorScheme="red" mt={2}>
                  In Jail ({player.jailTurns} turns)
                </Badge>
              )}
              
              {properties.length > 0 && (
                <Box mt={2} pt={2} borderTop="1px solid" borderColor="gray.200">
                  <Text fontSize="sm" fontWeight="medium" mb={1}>
                    Properties:
                  </Text>
                  <Flex wrap="wrap" gap={1}>
                    {properties.map(property => (
                      <Badge
                        key={property.id}
                        colorScheme={property.mortgaged ? 'gray' : 'blue'}
                        variant={property.mortgaged ? 'outline' : 'solid'}
                      >
                        {property.name}
                      </Badge>
                    ))}
                  </Flex>
                </Box>
              )}
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
};

export default PlayerList; 