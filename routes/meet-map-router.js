const { ensureAuthenticated } = require('../passport-middleware/check-auth');

module.exports = (io) => {
    const router = require('express').Router();
    let user = null;

    // Configure Redis
    const Redis = require('ioredis');
    const redis = new Redis({ host: `${process.env.REDIS_HOST}`, port: `${process.env.REDIS_PORT}`, password: `${process.env.REDIS_PASSWORD}` });
    const usersInRoom = new Set();

    // For testing purposes only. Store shared test locations and icons in Redis
    // const storedLocations = [{ userId: "3", lat: 49.2689, lng: -123.0035, iconUrl: "/icons/1.jpeg", username: "test1" },
    // { userId: "4", lat: 49.3043, lng: -123.1443, iconUrl: "/icons/2.jpeg", username: "test2" },
    // { userId: "5", lat: 49.2768, lng: -123.1120, iconUrl: "/icons/3.jpeg", username: "test3" },
    // { userId: "6", lat: 49.2827, lng: -123.1207, iconUrl: "/icons/4.jpeg", username: "test4" },
    // { userId: "7", lat: 49.2024, lng: -123.1000, iconUrl: "/icons/5.jpeg", username: "test5testttetestestsets" }];

    // Store test locations in Redis
    // storedLocations.forEach((location) => {
        // redis.geoadd('locations', location.lng, location.lat, location.userId);
        // redis.hset('userIcons', location.userId, location.iconUrl);
        // redis.hset('usernames', location.userId, location.username);

        // to remove test shared locations and icons from redis:
        // redis.zrem('locations', location.userId);
        // redis.hdel('userIcons', location.userId);
        // redis.hdel('usernames', location.userId);
        // console.log('test location with icon added to redis', location);
    // });

    // Handle event for when a user requests all shared locations in the radius of 20km
    const getStoredSharedLocations = (socket) => {
        socket.on('getSharedLocations', async ({ lat, lng, userId }) => {
            await redis.georadius('locations', lng, lat, 30, 'km', 'WITHDIST', 'WITHCOORD', 'ASC', async (err, locations) => {
                if (err) {
                    console.log(err);
                } else {
                    const nearbyUsers = locations.map((result) => ({
                        userId: result[0],
                        distance: result[1],
                        lng: result[2][0],
                        lat: result[2][1],
                    }));
                    const icons = {};
                    const usernames = {};
                    for (user of nearbyUsers) {
                        await redis.hget('userIcons', user.userId, (err, icon) => {
                            if (err) {
                                console.log(err);
                            } else {
                                icons[user.userId] = icon;
                            }
                        });
                        await redis.hget('usernames', user.userId, (err, username) => {
                            if (err) {
                                console.log(err);
                            } else {
                                usernames[user.userId] = username;
                            }
                        });
                    };
                    const data = { userId, nearbyUsers, icons, usernames }
                    // console.log(data, "data");
                    socket.emit('nearbySharedLocations', data);
                }
            });
        });
    };

    // Handle event for when a user shares their location
    const addUserToRedis = async (socket, io) => {
        socket.on('addNewSharedLocation', async ({ userId, lat, lng, iconUrl, username }) => {
            // console.log(`Add user. Adding new user ${userId} to Redis`);
            await redis.geoadd('locations', lng, lat, userId);
            await redis.hset('userIcons', userId, iconUrl);
            await redis.hset('usernames', userId, username);
            await redis.georadius('traversingPositions', lng, lat, 50, 'km', 'WITHDIST', 'WITHCOORD', 'ASC', (err, locations) => {
                if (err) {
                    console.log(err);
                } else {
                    let nearbyUsers = locations.map((result) => ({
                        userId: result[0],
                        distance: result[1],
                        lng: result[2][0],
                        lat: result[2][1],
                    }));
                    nearbyUsers = nearbyUsers.filter((user) => user.userId !== userId);
                    // console.log(nearbyUsers, `nearby users after adding new user ${userId} to Redis`);
                    nearbyUsers.forEach((user) => {
                        // console.log("emitting addLocation event to user " + user.userId + " from user " + userId + " that added their location");
                        io.to(`${user.userId}`).emit('addMarker', { userId: userId, lat, lng, iconUrl, username });
                    });
                }
            });
        });
    };

    // Handle event for when a user removes their location
    const removeUserFromRedis = (socket, io) => {
        socket.on('removeSharedLocation', async ({ userId, lat, lng }) => {
            // console.log(`remove shared location event emitted.Removing user ${userId} location from Redis`);
            await redis.zrem('locations', userId);
            await redis.hdel('userIcons', userId);
            await redis.hdel('usernames', userId);
            await redis.georadius('traversingPositions', lng, lat, 50, 'km', 'WITHDIST', 'WITHCOORD', 'ASC', (err, locations) => {
                if (err) {
                    console.log(err);
                } else {
                    let nearbyUsers = locations.map((result) => ({
                        userId: result[0],
                        distance: result[1],
                        lng: result[2][0],
                        lat: result[2][1],
                    }));
                    nearbyUsers = nearbyUsers.filter((user) => user.userId !== userId);
                    // console.log(nearbyUsers, `nearby users will receive the event that user ${userId} removed their location`);
                    nearbyUsers.forEach((user) => {
                        // console.log("emitting removeLocation event to user" + user.userId + "from user" + userId + "that removed their location");
                        io.to(`${user.userId}`).emit('removeMarker', { userId });
                    });
                }
            });
        });
    };

    // Handle join event for when a user opens the meet map. Add them to the room
    const handleUserThatOpenedMeetMap = (socket) => {
        socket.on('join', ({ userId }) => {
            // if (usersInRoom.has(userId)) {
            //     console.log(`User ${userId} has already joined the room`);
            // } else {
            socket.request.user = userId;
            socket.join(userId);
            usersInRoom.add(userId);
            // console.log(usersInRoom, "usersInRoom after adding user");
            // }
        });
    };

    // Handle leave event for when a user closes the meet map. Remove them from the room
    const handleUserThatClosedMeetMap = (socket) => {
        const userId = `${socket.request.user}`;
        redis.zrem('locations', userId);
        redis.hdel('userIcons', userId);
        redis.hdel('usernames', userId);
        redis.zrem('traversingPositions', userId);
        socket.leave(userId);
        usersInRoom.delete(userId);
        console.log(socket.request.user, "user disconnected");
    };

    // Track user traversing on map to show them if someone is starting to share their location
    // This is for users that are not sharing their location themselves but are just viewing the map
    const addUserTraversingPosition = (socket) => {
        socket.on('userTraversingOnMap', async ({ userId, lat, lng }) => {
            await redis.geoadd('traversingPositions', lng, lat, userId);
        });
    };

    // Set up event listeners for Socket.io connections
    io.on('connection', (socket) => {
        console.log('user connected');
        handleUserThatOpenedMeetMap(socket);
        getStoredSharedLocations(socket);
        addUserTraversingPosition(socket);
        addUserToRedis(socket, io);
        removeUserFromRedis(socket, io);
        socket.on('disconnect', () => {
            handleUserThatClosedMeetMap(socket);
        });
    });

    //     // Meet map route
    router.get('/', ensureAuthenticated, (req, res) => {
        user = req.user;
        res.render('./meet-map-views/meet-map', { user: req.user });
    });

    return router;
}