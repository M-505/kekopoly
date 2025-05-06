import { Box, Flex, Text, Image } from '@chakra-ui/react';
import { useSelector } from 'react-redux';

const Board = () => {
  const board = useSelector(state => state.game.board);
  const players = useSelector(state => state.game.players);

  // Board layout configuration
  const boardLayout = {
    top: board.slice(0, 10),
    right: board.slice(10, 20),
    bottom: board.slice(20, 30),
    left: board.slice(30, 40),
  };

  const renderSpace = (space, index) => {
    const playersOnSpace = players.filter(p => p.position === index);
    
    return (
      <Box
        key={index}
        position="relative"
        width="100%"
        height="100%"
        border="1px solid"
        borderColor="gray.200"
        p={2}
        bg={space.color || 'white'}
      >
        <Text fontSize="xs" fontWeight="bold" textAlign="center">
          {space.name}
        </Text>
        {space.price && (
          <Text fontSize="xs" textAlign="center">
            {space.price} Kekels
          </Text>
        )}
        {space.owner && (
          <Box
            position="absolute"
            bottom="2px"
            right="2px"
            width="8px"
            height="8px"
            borderRadius="full"
            bg={players.find(p => p.id === space.owner)?.color || 'gray'}
          />
        )}
        {playersOnSpace.length > 0 && (
          <Flex
            position="absolute"
            top="2px"
            left="2px"
            gap="2px"
            wrap="wrap"
            maxWidth="80%"
          >
            {playersOnSpace.map(player => (
              <Box
                key={player.id}
                width="8px"
                height="8px"
                borderRadius="full"
                bg={player.color}
              />
            ))}
          </Flex>
        )}
      </Box>
    );
  };

  return (
    <Box
      width="800px"
      height="800px"
      position="relative"
      margin="0 auto"
      bg="brand.100"
      borderRadius="md"
      p={4}
    >
      {/* Top row */}
      <Flex position="absolute" top="0" left="0" width="100%" height="12.5%">
        {boardLayout.top.map((space, index) => renderSpace(space, index))}
      </Flex>

      {/* Right column */}
      <Flex
        position="absolute"
        top="12.5%"
        right="0"
        width="12.5%"
        height="75%"
        direction="column"
      >
        {boardLayout.right.map((space, index) => renderSpace(space, index + 10))}
      </Flex>

      {/* Bottom row */}
      <Flex
        position="absolute"
        bottom="0"
        left="0"
        width="100%"
        height="12.5%"
        direction="row-reverse"
      >
        {boardLayout.bottom.map((space, index) => renderSpace(space, index + 20))}
      </Flex>

      {/* Left column */}
      <Flex
        position="absolute"
        top="12.5%"
        left="0"
        width="12.5%"
        height="75%"
        direction="column-reverse"
      >
        {boardLayout.left.map((space, index) => renderSpace(space, index + 30))}
      </Flex>

      {/* Center area */}
      <Box
        position="absolute"
        top="12.5%"
        left="12.5%"
        width="75%"
        height="75%"
        bg="white"
        border="2px solid"
        borderColor="brand.500"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="2xl" fontWeight="bold" color="brand.500">
          KEKOPOLY
        </Text>
      </Box>
    </Box>
  );
};

export default Board; 