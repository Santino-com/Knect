export function generateRoomId(user1Id, user2Id) {
    const sortedIds = [user1Id, user2Id].sort((a, b) => a - b);
    return `room_${sortedIds[0]}_${sortedIds[1]}`;
}
