import React, { useState, useRef, useCallback } from 'react';
import { Box, Heading, VStack, HStack, Text, Button, Image, Code, SimpleGrid, Tag, Input, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, FormControl, FormLabel, Grid, GridItem } from '@chakra-ui/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import gameBoardImage from '../assets/new_game_board.png';
import { boardSpaces } from '../core/models/boardConfig'; // Use the new path based on the attached file location

const ItemTypes = {
  SPACE: 'space', // Changed from MARKER
};

// Updated Draggable item - represents a board space
const DraggableSpace = ({ space }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SPACE,
    item: { position: space.position }, // Pass the position when dragging
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <Tag
      ref={drag}
      variant='subtle' 
      colorScheme='gray'
      p={2}
      m={1} // Add some margin
      cursor="move"
      opacity={isDragging ? 0.5 : 1}
      width="100%" // Make tags fill grid cells
      justifyContent="center"
    >
      {`[${space.position}] ${space.name || space.propertyId || space.type}`}
    </Tag>
  );
};

// Updated DraggablePlacedMarker with resize handles
const DraggablePlacedMarker = ({ position, left, top, width, height, onSelect, onResize }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SPACE,
    item: { position }, 
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [position]);

  const handleResizeStart = (e, corner) => {
    e.stopPropagation(); // Prevent marker selection when resizing
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseFloat(width);
    const startHeight = parseFloat(height);
    const startLeft = parseFloat(left);
    const startTop = parseFloat(top);
    
    const handleMouseMove = (moveEvent) => {
      const boardRect = moveEvent.target.closest('[data-board-container]').getBoundingClientRect();
      const deltaX = (moveEvent.clientX - startX) / boardRect.width * 100;
      const deltaY = (moveEvent.clientY - startY) / boardRect.height * 100;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      // Adjust based on which corner is being dragged
      switch(corner) {
        case 'topLeft':
          newLeft = startLeft + deltaX;
          newTop = startTop + deltaY;
          newWidth = startWidth - deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'topRight':
          newTop = startTop + deltaY;
          newWidth = startWidth + deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'bottomLeft':
          newLeft = startLeft + deltaX;
          newWidth = startWidth - deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'bottomRight':
          newWidth = startWidth + deltaX;
          newHeight = startHeight + deltaY;
          break;
        default:
          break;
      }
      
      // Ensure minimum size
      if (newWidth < 2) newWidth = 2;
      if (newHeight < 2) newHeight = 2;
      
      onResize(position, {
        left: newLeft.toFixed(2),
        top: newTop.toFixed(2),
        width: newWidth.toFixed(2),
        height: newHeight.toFixed(2)
      });
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Define common styles for resize handles
  const handleStyle = {
    position: 'absolute',
    width: '12px',
    height: '12px',
    backgroundColor: 'white',
    border: '1px solid red',
    zIndex: 4,
    cursor: 'pointer',
  };

  return (
    <Box
      ref={drag}
      key={position}
      position="absolute"
      left={`${left}%`}
      top={`${top}%`}
      width={`${width || 8}%`}
      height={`${height || 10}%`}
      bg='rgba(255, 0, 0, 0.3)' 
      borderRadius='md'
      border="2px dashed red"
      title={`Pos: ${position}`}
      zIndex={2} 
      cursor="move"
      opacity={isDragging ? 0.3 : 0.6}
      onClick={() => onSelect(position)}
      _hover={{ opacity: 0.8 }}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize="12px"
      fontWeight="bold"
      color="white"
      textShadow="0 0 3px black"
      overflow="visible" // Changed to visible for handles
      userSelect="none"
    >
      {position}
      
      {/* Resize handles */}
      <Box
        style={{...handleStyle, top: '-6px', left: '-6px', cursor: 'nw-resize'}}
        onMouseDown={(e) => handleResizeStart(e, 'topLeft')}
      />
      <Box
        style={{...handleStyle, top: '-6px', right: '-6px', cursor: 'ne-resize'}}
        onMouseDown={(e) => handleResizeStart(e, 'topRight')}
      />
      <Box
        style={{...handleStyle, bottom: '-6px', left: '-6px', cursor: 'sw-resize'}}
        onMouseDown={(e) => handleResizeStart(e, 'bottomLeft')}
      />
      <Box
        style={{...handleStyle, bottom: '-6px', right: '-6px', cursor: 'se-resize'}}
        onMouseDown={(e) => handleResizeStart(e, 'bottomRight')}
      />
    </Box>
  );
}

// Board Drop Target component with updated marker rendering
const BoardDropTarget = ({ onDrop, mappedPositions, onSelectMarker, onResizeMarker }) => {
  const boardRef = useRef(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ItemTypes.SPACE,
    drop: (item, monitor) => {
      onDrop(item, monitor, boardRef.current);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  const combinedRef = useCallback(node => {
      drop(node);
      boardRef.current = node;
  }, [drop]);

  return (
    <Box
      ref={combinedRef}
      position="relative"
      borderWidth={isOver ? '2px' : '1px'}
      borderColor={isOver ? 'blue.500' : 'gray.300'}
      bg={isOver ? 'rgba(0, 100, 255, 0.1)' : 'transparent'}
      width="fit-content"
      data-board-container="true" // Add marker for resize event handling
    >
      <Image 
        src={gameBoardImage} 
        alt="Game Board" 
        draggable="false" 
        onDragStart={(e) => e.preventDefault()} 
        pointerEvents="none" 
      />
      {/* Render markers with width and height */}
      {Object.entries(mappedPositions).map(([position, coords]) => (
        <DraggablePlacedMarker 
          key={position} 
          position={position} 
          left={coords.left}
          top={coords.top}
          width={coords.width}
          height={coords.height}
          onSelect={onSelectMarker}
          onResize={onResizeMarker}
        />
      ))}
    </Box>
  );
};

// Main mapping tool component with width and height adjustment
const BoardMapper = () => {
  const [mappedPositions, setMappedPositions] = useState({});
  const [filter, setFilter] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);

  // Fix drag and drop positioning
  const handleDrop = useCallback((item, monitor, boardElement) => {
    if (!boardElement) return;

    const { position } = item; 
    const dropPoint = monitor.getClientOffset(); // Position relative to viewport
    const boardRect = boardElement.getBoundingClientRect(); // Target element position

    // Calculate position relative to the board element in a more precise way
    const relativeX = dropPoint.x - boardRect.left;
    const relativeY = dropPoint.y - boardRect.top;

    // Calculate percentage based on board dimensions
    const leftPercent = (relativeX / boardRect.width) * 100;
    const topPercent = (relativeY / boardRect.height) * 100;

    console.log(`Drop Pos ${position} at:`, {
        dropPoint, boardRect, 
        relativeX, relativeY,
        leftPercent, topPercent
    });

    // Store left/top AND default width/height
    setMappedPositions((prev) => ({
      ...prev,
      [position]: {
        left: leftPercent.toFixed(2),
        top: topPercent.toFixed(2),
        width: "8.06", // Default width
        height: "9.97", // Default height
      },
    }));

    // Select the newly dropped position for adjustment
    setSelectedPosition(position);
  }, [setMappedPositions, setSelectedPosition]);

  // Handle resize from visual handles
  const handleResizeMarker = useCallback((position, dimensions) => {
    setMappedPositions(prev => ({
      ...prev,
      [position]: {
        ...prev[position],
        ...dimensions
      }
    }));
  }, [setMappedPositions]);

  // Update UI input values
  const handleDimensionChange = (dimension, value) => {
    if (!selectedPosition) return;
    
    setMappedPositions(prev => ({
      ...prev,
      [selectedPosition]: {
        ...prev[selectedPosition],
        [dimension]: value
      }
    }));
  };

  const copyToClipboard = () => {
    const positionsString = JSON.stringify(mappedPositions, null, 2);
    navigator.clipboard.writeText(positionsString)
      .then(() => alert('Coordinates copied to clipboard!'))
      .catch(err => console.error('Failed to copy coordinates: ', err));
  };

  // Filter board spaces based on input
  const filteredSpaces = boardSpaces.filter(space => {
     const name = space.name || space.propertyId || space.type;
     return name.toLowerCase().includes(filter.toLowerCase()) || space.position.toString().includes(filter);
  });

  return (
    <DndProvider backend={HTML5Backend}>
      <VStack p={5} spacing={5} align="stretch">
        <Heading>Board Coordinate Mapper</Heading>
        <Text>Drag a space from the list below onto its corresponding location on the board image. You can resize spaces by dragging the corner handles.</Text>
        
        <HStack spacing={10} align="flex-start" alignItems="flex-start"> 
          <Box flexBasis="300px" flexShrink={0}> 
            <Text mb={2} fontWeight="bold">Board Spaces:</Text>
            <Input 
              placeholder="Filter spaces by name or position..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              mb={3}
            />
            <Box maxHeight="60vh" overflowY="auto"> 
              <SimpleGrid columns={1} spacing={1}> 
                {filteredSpaces.map(space => (
                  <DraggableSpace key={space.position} space={space} />
                ))}
              </SimpleGrid>
            </Box>
          </Box>
          <VStack flex={1} alignItems="flex-start">
            <Text mb={2} fontWeight="bold">Board Drop Target:</Text>
            <BoardDropTarget 
              onDrop={handleDrop} 
              mappedPositions={mappedPositions} 
              onSelectMarker={setSelectedPosition}
              onResizeMarker={handleResizeMarker}
            />
          </VStack>
          {selectedPosition && mappedPositions[selectedPosition] && (
            <Box width="250px" bg="gray.50" p={4} borderRadius="md" borderWidth="1px">
              <Text mb={3} fontWeight="bold">
                Adjust Space {selectedPosition}
              </Text>
              <Grid templateColumns="auto 1fr" gap={3} alignItems="center">
                <GridItem><Text>Left:</Text></GridItem>
                <GridItem>
                  <NumberInput 
                    value={mappedPositions[selectedPosition].left}
                    onChange={(valueString) => handleDimensionChange('left', valueString)}
                    step={0.1}
                    precision={2}
                    size="sm"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </GridItem>

                <GridItem><Text>Top:</Text></GridItem>
                <GridItem>
                  <NumberInput 
                    value={mappedPositions[selectedPosition].top}
                    onChange={(valueString) => handleDimensionChange('top', valueString)}
                    step={0.1}
                    precision={2}
                    size="sm"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </GridItem>

                <GridItem><Text>Width:</Text></GridItem>
                <GridItem>
                  <NumberInput 
                    value={mappedPositions[selectedPosition].width}
                    onChange={(valueString) => handleDimensionChange('width', valueString)}
                    step={0.1}
                    precision={2}
                    size="sm"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </GridItem>

                <GridItem><Text>Height:</Text></GridItem>
                <GridItem>
                  <NumberInput 
                    value={mappedPositions[selectedPosition].height}
                    onChange={(valueString) => handleDimensionChange('height', valueString)}
                    step={0.1}
                    precision={2}
                    size="sm"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </GridItem>
              </Grid>
              <Button 
                size="sm" 
                colorScheme="blue" 
                mt={3} 
                onClick={() => setSelectedPosition(null)}
                width="full"
              >
                Done
              </Button>
            </Box>
          )}
        </HStack>

        <Box>
          <HStack justify="space-between" mb={2}>
             <Text fontWeight="bold">Captured Coordinates (by Position):</Text>
             <Button size="sm" onClick={copyToClipboard}>Copy JSON</Button>
          </HStack>
          <Code 
            p={4} 
            borderRadius="md" 
            width="100%" 
            maxHeight="300px" 
            overflowY="auto"
            display="block"
            whiteSpace="pre-wrap"
          >
            {JSON.stringify(mappedPositions, null, 2)}
          </Code>
        </Box>
      </VStack>
    </DndProvider>
  );
};

export default BoardMapper; 