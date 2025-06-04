import { useState, useEffect } from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '../components/ui/drawer';

const UsersPage = () => {
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchMobile, setSearchMobile] = useState('');
  const [searchType, setSearchType] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');

  const token = localStorage.getItem('token');

  const fetchUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch('https://wallet-backend-pkxi.onrender.com/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const updateBalance = async (id, amount) => {
    if (!token) return alert("Missing admin token");
    try {
      const res = await fetch(`https://wallet-backend-pkxi.onrender.com/admin/users/${id}/balance`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        alert('Failed to update balance');
      }
    } catch (err) {
      alert('⚠️ Error connecting to backend');
      console.error('Balance update error:', err);
    }
  };

  const updateUserField = async (field, value) => {
    if (!token || !selectedUser || !value) return;
    const url = `https://wallet-backend-pkxi.onrender.com/admin/users/${selectedUser._id}/${field}`;
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field === 'password' ? 'newPassword' : field === 'pin' ? 'newPin' : `new${field.charAt(0).toUpperCase() + field.slice(1)}`]: value }),
      });

      if (res.ok) {
        alert(`${field} updated!`);
        setNewUsername('');
        setNewEmail('');
        setNewPassword('');
        setNewPin('');
        fetchUsers();
        setSelectedUser(null);
      } else {
        alert(`Failed to update ${field}`);
      }
    } catch (err) {
      console.error(`${field} update error:`, err);
      alert(`Error updating ${field}`);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="p-4 space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-6 gap-4 items-end">
        <div><label>User ID</label><Input value={searchId} onChange={e => setSearchId(e.target.value)} /></div>
        <div><label>Last 4 digits</label><Input value={searchMobile} onChange={e => setSearchMobile(e.target.value)} /></div>
        <div><label>Name</label><Input value={searchName} onChange={e => setSearchName(e.target.value)} /></div>
        <div>
          <label>Type</label>
          <Select onValueChange={setSearchType}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex gap-2">
          <Button className="bg-cyan-400 text-white">Query</Button>
          <Button variant="outline">Reset</Button>
          <Button variant="secondary">Added</Button>
        </div>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">#</th>
              <th className="border px-4 py-2">User ID</th>
              <th className="border px-4 py-2">Email</th>
              <th className="border px-4 py-2">Balance</th>
              <th className="border px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user._id} className="text-center">
                <td className="border px-4 py-2">{index + 1}</td>
                <td className="border px-4 py-2">{user._id}</td>
                <td className="border px-4 py-2">{user.email}</td>
                <td className="border px-4 py-2">
                  ${typeof user.balance === "number" ? user.balance.toFixed(2) : "0.00"}
                </td>
                <td className="border px-4 py-2 space-x-1">
                  <Button className="text-xs px-2 py-1" onClick={() => {
                    const amount = prompt("Enter amount to ADD:");
                    if (!amount) return;
                    updateBalance(user._id, parseFloat(amount));
                  }}>Add Funds</Button>
                  <Button variant="destructive" className="text-xs px-2 py-1" onClick={() => {
                    const amount = prompt("Enter amount to REMOVE:");
                    if (!amount) return;
                    updateBalance(user._id, -Math.abs(parseFloat(amount)));
                  }}>Remove Funds</Button>
                  <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setSelectedUser(user)}>
                    More
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* More Options Drawer */}
      {selectedUser && (
        <Drawer open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>User Settings for {selectedUser.email}</DrawerTitle>
              <DrawerDescription className="space-y-3 mt-4">
                <Input placeholder="New Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                <Button className="w-full" onClick={() => updateUserField('username', newUsername)}>
                  Save Username
                </Button>
                <Input placeholder="New Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Button className="w-full" onClick={() => updateUserField('email', newEmail)}>
                  Save Email
                </Button>
                <Input placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
                <Button className="w-full" onClick={() => updateUserField('password', newPassword)}>
                  Save Password
                </Button>
                <Input placeholder="New Withdrawal PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} type="password" />
                <Button className="w-full" onClick={() => updateUserField('pin', newPin)}>
                  Save PIN
                </Button>
                <Button className="w-full" variant="destructive">Freeze Account</Button>
                <Button className="w-full" variant="destructive">Freeze Withdrawals</Button>
              </DrawerDescription>
            </DrawerHeader>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
};

export default UsersPage;