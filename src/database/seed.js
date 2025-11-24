const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../config/logger');

const seedUsers = async () => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Create gyms first
    const gyms = [
      {
        id: uuidv4(),
        name: 'FitSync Downtown',
        description: 'Premium fitness center in the heart of the city',
        address: {
          street: '123 Main Street',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'USA'
        },
        phone: '+12125551234',
        email: 'downtown@fitsync.com',
        amenities: ['pool', 'sauna', 'parking', 'lockers', 'cafe']
      },
      {
        id: uuidv4(),
        name: 'FitSync Westside',
        description: 'Family-friendly gym with state-of-the-art equipment',
        address: {
          street: '456 West Avenue',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country: 'USA'
        },
        phone: '+13105551234',
        email: 'westside@fitsync.com',
        amenities: ['childcare', 'pool', 'parking', 'lockers']
      }
    ];

    for (const gym of gyms) {
      await client.query(
        `INSERT INTO gyms (id, name, description, address, phone, email, amenities)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [gym.id, gym.name, gym.description, gym.address, gym.phone, gym.email, gym.amenities]
      );
    }

    logger.info(`Seeded ${gyms.length} gyms`);

    // Default password for all demo accounts
    const defaultPassword = await bcrypt.hash('Admin@123', 10);
    const trainerPassword = await bcrypt.hash('Trainer@123', 10);
    const clientPassword = await bcrypt.hash('Client@123', 10);
    const gymPassword = await bcrypt.hash('Gym@123', 10);

    // Seed users
    const users = [
      // Admin
      {
        email: 'admin@fitsync.com',
        password_hash: defaultPassword,
        role: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        phone: '+15555551000',
        gym_id: null
      },
      // Gym Owners
      {
        email: 'gym@fitsync.com',
        password_hash: gymPassword,
        role: 'gym_owner',
        first_name: 'John',
        last_name: 'Owner',
        phone: '+15555551001',
        gym_id: gyms[0].id
      },
      {
        email: 'owner2@fitsync.com',
        password_hash: gymPassword,
        role: 'gym_owner',
        first_name: 'Jane',
        last_name: 'Manager',
        phone: '+15555551002',
        gym_id: gyms[1].id
      },
      // Trainers
      {
        email: 'trainer@fitsync.com',
        password_hash: trainerPassword,
        role: 'trainer',
        first_name: 'Mike',
        last_name: 'Trainer',
        phone: '+15555552001',
        gym_id: gyms[0].id,
        date_of_birth: '1988-05-15'
      },
      {
        email: 'sarah.trainer@fitsync.com',
        password_hash: trainerPassword,
        role: 'trainer',
        first_name: 'Sarah',
        last_name: 'Johnson',
        phone: '+15555552002',
        gym_id: gyms[0].id,
        date_of_birth: '1990-08-22'
      },
      {
        email: 'david.trainer@fitsync.com',
        password_hash: trainerPassword,
        role: 'trainer',
        first_name: 'David',
        last_name: 'Williams',
        phone: '+15555552003',
        gym_id: gyms[1].id,
        date_of_birth: '1985-03-10'
      }
    ];

    // Add 35 client users
    const firstNames = ['Alex', 'Emma', 'Chris', 'Sophia', 'Ryan', 'Olivia', 'James', 'Ava', 'Michael', 'Isabella',
                        'Daniel', 'Mia', 'Matthew', 'Charlotte', 'Joseph', 'Amelia', 'Andrew', 'Harper', 'Joshua', 'Evelyn',
                        'David', 'Abigail', 'William', 'Emily', 'Benjamin', 'Elizabeth', 'Samuel', 'Sofia', 'Henry', 'Avery',
                        'Sebastian', 'Ella', 'Jackson', 'Scarlett', 'Lucas'];

    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    for (let i = 0; i < 35; i++) {
      const firstName = firstNames[i];
      const lastName = lastNames[i % lastNames.length];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;

      users.push({
        email,
        password_hash: clientPassword,
        role: 'client',
        first_name: firstName,
        last_name: lastName,
        phone: `+1555556${String(i).padStart(4, '0')}`,
        gym_id: i % 2 === 0 ? gyms[0].id : gyms[1].id,
        date_of_birth: `19${80 + (i % 20)}-0${1 + (i % 9)}-${10 + (i % 18)}`
      });
    }

    // Special test client
    users.push({
      email: 'client@fitsync.com',
      password_hash: clientPassword,
      role: 'client',
      first_name: 'Test',
      last_name: 'Client',
      phone: '+15555559999',
      gym_id: gyms[0].id,
      date_of_birth: '1995-01-15'
    });

    let insertedCount = 0;
    for (const user of users) {
      try {
        await client.query(
          `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, gym_id, date_of_birth)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.email, user.password_hash, user.role, user.first_name, user.last_name,
           user.phone, user.gym_id, user.date_of_birth]
        );
        insertedCount++;
      } catch (error) {
        logger.warn(`User ${user.email} already exists, skipping`);
      }
    }

    await client.query('COMMIT');
    logger.info(`Seeded ${insertedCount} users successfully`);

    return {
      gyms,
      userCount: insertedCount
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seed if executed directly
if (require.main === module) {
  seedUsers()
    .then((result) => {
      logger.info('Database seeded successfully', result);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database seed failed:', error);
      process.exit(1);
    });
}

module.exports = { seedUsers };
