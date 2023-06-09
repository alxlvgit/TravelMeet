const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { ensureAuthenticated } = require('../passport-middleware/check-auth');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const prisma = new PrismaClient();
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

// Individual user profile page. Needs refactoring.
router.get('/other/:userId', ensureAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: Number(req.params.userId),
      },
      include: {
        posts: {
          include: {
            author: true, // Fetches the author object from each post
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        following: true,
        followers: true,
      },
    });
    let posts = [];
    if (user.posts) {
      posts = user.posts;
    }
    for (const post of posts) {
      const params = {
        Bucket: bucketName,
        Key: post.image,
      };
      const command = new GetObjectCommand(params);
      const url = await getSignedUrl(s3, command, { expiresIn: 60 });
      post.imageUrl = url;
      const params2 = {
        Bucket: bucketName,
        Key: post.author.profileImageURI,
      };
      const command2 = new GetObjectCommand(params2);
      const url2 = await getSignedUrl(s3, command2, { expiresIn: 60 });
      post.author.profileImageURI = url2;
    };
    const currentUser = req.user.id === user.id;
    const params = {
      Bucket: bucketName,
      Key: user.profileImageURI,
    };
    const command = new GetObjectCommand(params);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    user.profileImageURI = url;
    res.render('./user-profile-views/user-profile', { user: user, currentUser: currentUser, posts: posts });
  } catch (error) {
    console.log(error);
  }
});

// Current user profile page. Needs refactoring.
router.get('/', ensureAuthenticated, async (req, res) => {
  const currentUser = req.user;
  const user = await prisma.user.findUnique({
    where: {
      id: Number(currentUser.id),
    },
    include: {
      posts: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      following: true,
      followers: true,
    },
  });
  let posts = [];
  if (user.posts) {
    posts = user.posts;
  }
  for (const post of posts) {
    const params = {
      Bucket: bucketName,
      Key: post.image,
    };
    const command = new GetObjectCommand(params);
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });
    post.imageUrl = url;
    const params2 = {
      Bucket: bucketName,
      Key: post.author.profileImageURI,
    };
    const command2 = new GetObjectCommand(params2);
    const url2 = await getSignedUrl(s3, command2, { expiresIn: 3600 });
    post.author.profileImageURI = url2;
  };
  const params = {
    Bucket: bucketName,
    Key: user.profileImageURI,
  };
  const command = new GetObjectCommand(params);
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  user.profileImageURI = url;
  res.render('./user-profile-views/user-profile', { currentUser: true, user: user, posts: user.posts });
});

module.exports = router;
