const bcrypt = require('bcryptjs');
bcrypt.hash('&é"\'(-è_', 10).then(h => console.log(h));