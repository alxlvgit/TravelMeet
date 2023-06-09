const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { fetchSingleEvent, filterEventImages, getGroups, totalNumberOfPeopleForEvent } = require('../helper-functions/events-helpers');
const { getPost, getRelatedPosts } = require('../helper-functions/posts-helpers');
const prisma = new PrismaClient();
const { ensureAuthenticated } = require('../passport-middleware/check-auth');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");


const bucketName = process.env.BUCKET_NAME
const bucketRegion = process.env.BUCKET_REGION
const accessKey = process.env.ACCESS_KEY
const secretAccessKey = process.env.SECRET_ACCESS_KEY

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

router.get('/', ensureAuthenticated, async (req, res) => {
  const users = await prisma.user.findMany();
  res.render('./explore-views/explore', { users: users });
}
);

// Event page
router.get('/event/:eventId', ensureAuthenticated, async (req, res) => {
  try {
    const eventData = await fetchSingleEvent(req.params.eventId);
    const eventImage = await filterEventImages(eventData.images);
    let groups = await getGroups(req.params.eventId);
    const totalNumberOfPeople = await totalNumberOfPeopleForEvent(groups);
    for (const group of groups) {
      const params = {
        Bucket: bucketName,
        Key: group.creator.profileImageURI,
      };
      const command = new GetObjectCommand(params);
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      group.creator.profileImageURI = url;
      for (const member of group.members) {
        const params = {
          Bucket: bucketName,
          Key: member.profileImageURI,
        };
        const command = new GetObjectCommand(params);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        member.profileImageURI = url;
      };
    };
    const eventImageURL = eventImage[0].url;
    res.render('./explore-views/event', {
      event: eventData,
      eventImageURL: eventImageURL,
      eventGroups: groups,
      totalNumberOfPeople: totalNumberOfPeople
    });
  } catch (error) {
    console.log(error);
  }
}
);

// Group page
router.get('/event/:eventId/group/:groupId', ensureAuthenticated, async (req, res) => {
  try {
    const eventData = await fetchSingleEvent(req.params.eventId);
    const eventImage = await filterEventImages(eventData.images);
    const groups = await getGroups(req.params.eventId);
    const totalNumberOfPeople = await totalNumberOfPeopleForEvent(groups);
    const group = await prisma.group.findUnique({
      where: {
        id: Number(req.params.groupId)
      },
      include: {
        creator: true,
        members: true
      }
    });
    group.creator.profileImageURI = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucketName,
      Key: group.creator.profileImageURI,
    }), { expiresIn: 3600 });
    for (const member of group.members) {
      member.profileImageURI = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: bucketName,
        Key: member.profileImageURI,
      }), { expiresIn: 3600 });
    };
    res.render('./explore-views/group', {
      group: group,
      event: eventData, eventImageURL: eventImage[0].url,
      totalNumberOfPeople: totalNumberOfPeople,
      user: req.user
    });
  } catch (error) {
    console.log(error);
  }
}
);

// Create group page
router.post('/create-group/:eventId', ensureAuthenticated, async (req, res) => {
  try {
    await prisma.group.create({
      data: {
        name: req.body.groupName,
        creatorId: req.user.id,
        eventId: req.params.eventId,
        creatorMessage: req.body.creatorMessage,
      }
    });
    res.redirect(`/event/${req.params.eventId}`);
  } catch (error) {
    console.log(error);
  }
}
);

// Delete group
router.get('/delete-group/:groupId/:eventId', ensureAuthenticated, async (req, res) => {
  try {
    await prisma.group.delete({
      where: {
        id: Number(req.params.groupId)
      }
    });
    res.redirect(`/event/${req.params.eventId}`);
  } catch (error) {
    console.log(error);
  }
}
);

// Feeds post page
router.get('/posts/:postId', ensureAuthenticated, async (req, res) => {
  const postId = Number(req.params.postId);
  try {
    const postData = await prisma.post.findUnique({
      where: {
        id: postId
      },
      include: {
        author: true
      }
    });
    const getObjectParams = {
      Bucket: bucketName,
      Key: postData.author.profileImageURI,
    };
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });
    postData.author.profileImageURI = url;
    const relatedPosts = await getRelatedPosts(postData.category, postId);
    relatedPosts.push(postData);
    for (const rPost of relatedPosts) {
      const getObjectParams = {
        Bucket: bucketName,
        Key: rPost.image,
      };
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 60 });
      rPost.imageUrl = url;
    }
    relatedPosts.pop();
    const post = postData;
    res.render('./explore-views/feeds-post', { post: post, relatedPosts: relatedPosts });
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;