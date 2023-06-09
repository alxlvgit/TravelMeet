const currentUrl = window.location.href;
const eventId = currentUrl.split('/')[4];
let groupRelatedPageOpen = false;
let groupId = "";

// Init Swiper for event and groups
const swiper = new Swiper(".swiper", {
    slidesPerView: "auto",
    freeMode: true,
    mousewheel: {
        releaseOnEdges: true,
    },
});


// Check if URL contains only event, or event and group
if (currentUrl.includes('event') && currentUrl.includes('group')) {
    groupRelatedPageOpen = true;
    console.log("Group page is open");
} else {
    console.log("Event page is open");
}

// handle group window
const handleGroupWindow = async () => {
    groupId = currentUrl.split('/')[6];
    const joinButton = document.querySelector('.join-button');
    const leaveButton = document.querySelector('.leave-button');
    handleJoinButton(joinButton);
    handleLeaveButton(leaveButton);
    await renderGroupMembers();
}

// Check if group related window is open
if (groupRelatedPageOpen) {
    handleGroupWindow();
}

// Generate group member HTML
function generateMemberHtml(member) {
    return `
      <div class="swiper-slide w-auto relative">
      <a href="/user-profile/other/${member.id}" class="absolute w-full h-full top-0 left-0 z-20"></a>
        <img class="w-16 h-16 object-cover rounded-full border-2 border-white outline-[#878d26] outline outline-2 m-1"
          src="${member.profileImageURI}" alt="Profile 1" />
      </div>
    `;
}

// Render group members to DOM 
async function renderGroupMembers() {
    const response = await fetch(`/api-events/group/${groupId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const data = await response.json();
    const membersContainer = document.querySelector('.members-container .swiper-wrapper');
    membersContainer.innerHTML = '';
    const group = data.group;
    group.members.forEach(member => {
        const memberHtml = generateMemberHtml(member);
        membersContainer.innerHTML += memberHtml;
    });
    swiper.update();
    const { isCreator, isMember } = await checkIfCreatorOrMember(group, data.userId);
    switchFooterButtons(isCreator, isMember);
    const membersTitle = document.querySelector('.members-title');
    membersTitle.innerText = `Members (${group.members.length})`;
}

// Switch footer buttons
const switchFooterButtons = (isCreator, isMember) => {
    const joinButton = document.querySelector('.join-button');
    const leaveButton = document.querySelector('.leave-button');
    const deleteButton = document.querySelector('.delete-button');
    if (isCreator) {
        joinButton.classList.add('hidden');
        leaveButton.classList.add('hidden');
        deleteButton.classList.remove('hidden');
    } else if (isMember) {
        joinButton.classList.add('hidden');
        leaveButton.classList.remove('hidden');
        deleteButton.classList.add('hidden');
    } else {
        joinButton.classList.remove('hidden');
        leaveButton.classList.add('hidden');
        deleteButton.classList.add('hidden');
    }
}

// Check if user is group creator or member
const checkIfCreatorOrMember = async (group, userId) => {
    let isCreator = false;
    let isMember = false;
    if (group.creatorId === userId) {
        isCreator = true;
    }
    group.members.forEach(member => {
        if (member.id === userId) {
            isMember = true;
        }
    });
    return {
        isCreator,
        isMember,
    };
}

// Handle join button
function handleJoinButton(joinButton) {
    joinButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const groupId = joinButton.dataset.groupid;
        const response = await fetch(`/api-events/groups/${groupId}/join`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        if (response.ok) {
            await renderGroupMembers();
        } else {
            alert(response.statusText);
        }
    });
}

// Handle leave button
function handleLeaveButton(leaveButton) {
    leaveButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const groupId = leaveButton.dataset.groupid;
        const response = await fetch(`/api-events/groups/${groupId}/leave`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        if (response.ok) {
            await renderGroupMembers();
        } else {
            alert(response.statusText);
        }
    });
}



