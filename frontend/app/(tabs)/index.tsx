// frontend/app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, SafeAreaView, StatusBar, TextInput, Modal, 
  KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://kottu-backend.onrender.com';

type User = { id: number; name: string; phone: string; role: 'customer' | 'shopkeeper'; shop_name: string; address: string; token?: string } | null;
type Shop = { id: number; name: string; shop_name: string; address: string };
type Category = { id: number; name: string };
type Product = { id: number; name: string; price: number; stock: number; category_id?: number };
type OrderItem = { item_name: string; quantity: number; price: number };
type Order = { 
  id: number; 
  shop_id?: number;
  customer_name: string; 
  customer_phone: string; 
  customer_address?: string;
  quantity?: number;
  items?: OrderItem[];
  status: string; 
  is_viewed?: boolean;
  created_at: string; 
  item_name?: string;
  shop_name?: string;
  shop_address?: string;
  shop_phone?: string;
  total?: number;
};
type ProfileData = { name: string; phone: string; address: string; name_detail?: string };

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', role: 'customer' as 'customer' | 'shopkeeper', shop_name: '', address: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  
  const [currentScreen, setCurrentScreen] = useState<'main' | 'orderDetail' | 'shops'>('main');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => { loadSession(); }, []);

  const loadSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('kottu_user');
      const savedShop = await AsyncStorage.getItem('kottu_selected_shop');
      if (savedUser) {
        setUser(JSON.parse(savedUser) as User);
        if (savedShop) setSelectedShop(JSON.parse(savedShop) as Shop);
      }
    } catch(e: any) {}
    finally { setLoading(false); }
  };

  const handleAuth = async () => {
    const { name, phone, password, role, shop_name, address } = formData;
    if(!phone || password.length < 4) return Alert.alert('Error', 'Phone & Password (min 4) required');
    if(!isLogin && !name) return Alert.alert('Error', 'Name required');

    setAuthLoading(true);
    try {
      const endpoint = isLogin ? 'login' : 'register';
      const body: any = { phone, password };
      if(!isLogin) { body.name = name; body.role = role; body.shop_name = role === 'shopkeeper' ? shop_name : ''; body.address = address; }

      const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error);
      
      const userData: User = { 
        id: data.user_id || data.id, 
        name: data.name, 
        phone, 
        role: data.role || role, 
        shop_name: data.shop_name || shop_name,
        address: data.address || address,
        token: data.token 
      };
      await AsyncStorage.setItem('kottu_user', JSON.stringify(userData));
      setUser(userData);
      if(data.role === 'customer') setSelectedShop(null);
      Alert.alert('Welcome', `Logged in as ${userData.name}`);
    } catch(e: any) { 
      Alert.alert('Failed', e.message || 'Unknown error'); 
    }
    finally { setAuthLoading(false); }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('kottu_user');
    await AsyncStorage.removeItem('kottu_selected_shop');
    setUser(null); setSelectedShop(null);
    setCurrentScreen('main');
    setFormData({ name: '', phone: '', password: '', role: 'customer', shop_name: '', address: '' });
  };

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /><Text style={{marginTop:10, color:'#666'}}>Connecting...</Text></View>;
  if(!user) return <AuthScreen isLogin={isLogin} setIsLogin={setIsLogin} formData={formData} setFormData={setFormData} handleAuth={handleAuth} authLoading={authLoading} />;

  if(currentScreen === 'orderDetail' && selectedOrder) {
    return <OrderDetailScreen 
      order={selectedOrder} 
      user={user}
      onBack={() => {setCurrentScreen('main'); setSelectedOrder(null);}} 
      onUpdateStatus={async (status) => {
        try {
          await fetch(`${API_URL}/api/order/update-status?order_id=${selectedOrder.id}&status=${status}`, {method:'POST'});
          Alert.alert('Success', `Order marked as ${status}`);
          setCurrentScreen('main');
          setSelectedOrder(null);
        } catch(e: any) { Alert.alert('Error', e.message); }
      }}
    />;
  }

  if(currentScreen === 'shops' && user?.role === 'customer') {
    return <ShopsListScreen 
      onBack={() => setCurrentScreen('main')}
      onSelectShop={(shop) => {
        setSelectedShop(shop);
        setCurrentScreen('main');
      }}
      onLogout={logout}
    />;
  }

  return <MainApp 
    user={user} 
    selectedShop={selectedShop} 
    setSelectedShop={setSelectedShop} 
    onLogout={logout}
    currentScreen={currentScreen}
    setCurrentScreen={setCurrentScreen}
    setSelectedOrder={setSelectedOrder}
  />;
}

// ==================== AUTH SCREEN ====================
function AuthScreen({ isLogin, setIsLogin, formData, setFormData, handleAuth, authLoading }: {
  isLogin: boolean; setIsLogin: (v: boolean) => void;
  formData: { name: string; phone: string; password: string; role: 'customer' | 'shopkeeper'; shop_name: string; address: string };
  setFormData: (v: any) => void; handleAuth: () => Promise<void>; authLoading: boolean;
}) {
  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        <View style={styles.authBox}>
          <Text style={styles.authTitle}>🛒 KOTTU</Text>
          <Text style={styles.authSub}>Multi-Shop Platform</Text>
          <Text style={styles.authToggle}>{isLogin ? 'Login' : 'Create Account'}</Text>
          {!isLogin && <TextInput style={styles.authInput} placeholder="Full Name" value={formData.name} onChangeText={v=>setFormData({...formData, name:v})} />}
          <TextInput style={styles.authInput} placeholder="Phone Number" keyboardType="phone-pad" value={formData.phone} onChangeText={v=>setFormData({...formData, phone:v})} />
          <TextInput style={styles.authInput} placeholder="Password (min 4)" secureTextEntry value={formData.password} onChangeText={v=>setFormData({...formData, password:v})} />
          {!isLogin && (
            <>
              <View style={styles.roleBox}>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='customer' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'customer'})}><Text style={styles.roleTxt}>🛍️ Customer</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='shopkeeper' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'shopkeeper'})}><Text style={styles.roleTxt}>🏪 Shopkeeper</Text></TouchableOpacity>
              </View>
              {formData.role==='shopkeeper' && <TextInput style={styles.authInput} placeholder="Shop Name" value={formData.shop_name} onChangeText={v=>setFormData({...formData, shop_name:v})} />}
              <TextInput style={styles.authInput} placeholder="Address (Optional)" value={formData.address} onChangeText={v=>setFormData({...formData, address:v})} />
            </>
          )}
          <TouchableOpacity style={styles.authBtn} onPress={handleAuth} disabled={authLoading}>
            <Text style={styles.authBtnText}>{authLoading ? '...' : (isLogin ? 'Login' : 'Sign Up')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setIsLogin(!isLogin)}><Text style={styles.authSwitch}>{isLogin ? "New? Sign Up" : "Have Account? Login"}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==================== SHOPS LIST SCREEN ====================
function ShopsListScreen({ onBack, onSelectShop, onLogout }: { 
  onBack: () => void; 
  onSelectShop: (shop: Shop) => void;
  onLogout: () => void;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/shops`)
      .then(r => r.json())
      .then(data => setShops(data as Shop[]))
      .finally(() => setLoading(false));
  }, []);

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>🛍️ Nearby Shops</Text>
          <TouchableOpacity onPress={onLogout}><Text style={styles.logoutBtn}>🚪 Logout</Text></TouchableOpacity>
        </View>
      </View>
      <FlatList 
        data={shops} 
        keyExtractor={i => i.id.toString()} 
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No shops registered yet.</Text>}
        renderItem={({item}) => (
          <TouchableOpacity style={styles.shopCard} onPress={() => onSelectShop(item)}>
            <View style={styles.shopCardContent}>
              <Text style={styles.shopCardTitle}>{item.shop_name || item.name}</Text>
              <Text style={styles.shopCardSub}>{item.address || 'No address provided'}</Text>
            </View>
            <Text style={styles.shopBadge}>Tap to View</Text>
          </TouchableOpacity>
        )} 
      />
    </SafeAreaView>
  );
}

// ==================== ORDER DETAIL SCREEN ====================
function OrderDetailScreen({ order, user, onBack, onUpdateStatus }: { 
  order: Order; 
  user: User;
  onBack: () => void;
  onUpdateStatus: (status: string) => Promise<void>;
}) {
  const [statusUpdating, setStatusUpdating] = useState(false);
  const isShopkeeper = user?.role === 'shopkeeper';
  const newStatus = isShopkeeper ? (order.status === 'pending' ? 'delivered' : 'pending') : null;

  const handleStatusUpdate = async () => {
    if(!newStatus) return;
    setStatusUpdating(true);
    try {
      await onUpdateStatus(newStatus);
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>📦 Order Details</Text>
          <View style={{width: 60}} />
        </View>
      </View>

      <ScrollView style={{flex:1, backgroundColor:'#F8F9FA'}} contentContainerStyle={{padding:16}}>
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Order #{order.id}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={[styles.statusText, order.status === 'delivered' || order.status === 'received' ? styles.statusDelivered : styles.statusPending]}>
              {order.status === 'delivered' ? 'Delivered' : order.status === 'received' ? 'Received' : 'Pending'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>{new Date(order.created_at).toLocaleString()}</Text>
          </View>
        </View>

        {isShopkeeper ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>👤 Customer Details</Text>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Name:</Text><Text style={styles.detailValue}>{order.customer_name}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Phone:</Text><Text style={styles.detailValue}>{order.customer_phone}</Text></View>
            {order.customer_address && <View style={styles.detailRow}><Text style={styles.detailLabel}>Address:</Text><Text style={styles.detailValue}>{order.customer_address}</Text></View>}
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>🏪 Shop Details</Text>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Shop:</Text><Text style={styles.detailValue}>{order.shop_name}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Phone:</Text><Text style={styles.detailValue}>{order.shop_phone}</Text></View>
            {order.shop_address && <View style={styles.detailRow}><Text style={styles.detailLabel}>Address:</Text><Text style={styles.detailValue}>{order.shop_address}</Text></View>}
          </View>
        )}

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>📦 Items Ordered</Text>
          {order.items && order.items.length > 0 ? (
            order.items.map((item, idx) => (
              <View key={idx} style={styles.itemRowDetail}>
                <View style={styles.itemInfoDetail}>
                  <Text style={styles.itemNameDetail}>{item.item_name}</Text>
                  <Text style={styles.itemQtyDetail}>Qty: {item.quantity}</Text>
                </View>
                <Text style={styles.itemPriceDetail}>₹{item.price * item.quantity}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No items</Text>
          )}
          {order.total && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalValue}>₹{order.total}</Text>
            </View>
          )}
        </View>

        {isShopkeeper && newStatus && (
          <TouchableOpacity 
            style={[styles.statusBtn, statusUpdating && styles.statusBtnDisabled]} 
            onPress={handleStatusUpdate}
            disabled={statusUpdating}
          >
            <Text style={styles.statusBtnText}>
              {statusUpdating ? 'Updating...' : `Mark as ${newStatus === 'delivered' ? 'Delivered ✓' : 'Pending'}`}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== MAIN APP ====================
function MainApp({ user, selectedShop, setSelectedShop, onLogout, currentScreen, setCurrentScreen, setSelectedOrder }: {
  user: User; selectedShop: Shop | null; setSelectedShop: (v: Shop | null) => void; onLogout: () => Promise<void>;
  currentScreen: string; setCurrentScreen: (v: any) => void; setSelectedOrder: (o: Order | null) => void;
}) {
  const [role] = useState<'customer' | 'shopkeeper'>(user?.role || 'customer');
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [shopStats, setShopStats] = useState({ total_orders: 0, recent_orders: [] as Order[] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(role==='shopkeeper' ? 'inventory' : 'inventory');
  
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [newItem, setNewItem] = useState({name:'', price:'', stock:'', category_id:''});
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [cart, setCart] = useState<{[key: number]: number}>({});
  const [custName, setCustName] = useState(user?.name || '');
  const [custAddress, setCustAddress] = useState(user?.address || '');
  const [editProfile, setEditProfile] = useState(false);
  const [profForm, setProfForm] = useState({name:'', phone:'', address:''});

  const shopId = role === 'shopkeeper' ? user?.id : (selectedShop?.id || null);

  const fetchData = async () => {
    if (!shopId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [pRes, catRes] = await Promise.all([
        fetch(`${API_URL}/api/inventory?shop_id=${shopId}`).then(r=>r.json()),
        fetch(`${API_URL}/api/categories?shop_id=${shopId}`).then(r=>r.json())
      ]);
      setProducts(pRes as Product[]);
      setCategories(catRes as Category[]);
      
      if(role === 'shopkeeper') {
        const [statsRes, ordRes] = await Promise.all([
          fetch(`${API_URL}/api/profile?user_id=${user?.id}&role=shopkeeper`).then(r=>r.json()),
          fetch(`${API_URL}/api/orders?shop_id=${shopId}`).then(r=>r.json())
        ]);
        setShopStats(statsRes);
        setOrders(ordRes as Order[]);
        setProfile(statsRes.profile);
      } else {
        const profRes = await fetch(`${API_URL}/api/profile?user_id=${user?.id}&role=customer`).then(r=>r.json());
        setProfile(profRes.profile);
        const custOrdRes = await fetch(`${API_URL}/api/customer/orders?customer_phone=${user?.phone}`).then(r=>r.json());
        setCustomerOrders(custOrdRes as Order[]);
      }
    } catch(e: any) { console.log('Fetch error:', e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if(role==='customer' && !selectedShop) {
      // Fetch shops handled by ShopsListScreen
    } else if(shopId) { fetchData(); }
  }, [shopId, role, selectedShop]);

  const addCategory = async () => {
    if(!newCat.trim() || !shopId) return Alert.alert('Error', 'Enter category name');
    try {
      await fetch(`${API_URL}/api/categories?shop_id=${shopId}&name=${encodeURIComponent(newCat)}`, {method:'POST'});
      setCatModal(false); setNewCat(''); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const addItem = async () => {
    if(!newItem.name || !newItem.price || !newItem.stock || !shopId) return Alert.alert('Error', 'Fill all fields');
    try {
      const catId = newItem.category_id ? parseInt(newItem.category_id) : null;
      await fetch(`${API_URL}/api/inventory/add?shop_id=${shopId}&name=${encodeURIComponent(newItem.name)}&price=${newItem.price}&stock=${newItem.stock}&category_id=${catId || ''}`, {method:'POST'});
      setItemModal(false); setNewItem({name:'', price:'', stock:'', category_id:''}); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const addToCart = (item: Product) => {
    setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };

  const placeOrder = async () => {
    if(!custName.trim() || !shopId) return Alert.alert('Error', 'Enter name');
    if(Object.keys(cart).length === 0) return Alert.alert('Error', 'Add items to cart');

    try {
      const itemsStr = Object.entries(cart).map(([itemId, qty]) => {
        const item = products.find(p => p.id === parseInt(itemId));
        return `${itemId}:${qty},${item?.price || 0}`;
      }).join('|');

      const res = await fetch(`${API_URL}/api/orders?shop_id=${shopId}&customer_name=${encodeURIComponent(custName)}&customer_phone=${user?.phone || ''}&customer_address=${encodeURIComponent(custAddress || '')}&items=${encodeURIComponent(itemsStr)}`, {method:'POST'});
      const data = await res.json();
      if(data.error) return Alert.alert('Failed', data.error);
      
      Alert.alert('Success', 'Order placed successfully!');
      setCart({}); setCustName(user?.name || ''); fetchData();
      if(role === 'customer') {
        const custOrdRes = await fetch(`${API_URL}/api/customer/orders?customer_phone=${user?.phone}`).then(r=>r.json());
        setCustomerOrders(custOrdRes as Order[]);
      }
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const updateProfile = async () => {
    try {
      await fetch(`${API_URL}/api/profile/update?user_id=${user?.id}&name=${encodeURIComponent(profForm.name)}&phone=${profForm.phone}&address=${encodeURIComponent(profForm.address)}`, {method:'POST'});
      setEditProfile(false); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const handleOrderPress = (order: Order) => {
    if(role === 'shopkeeper' && !order.is_viewed) {
      fetch(`${API_URL}/api/order/mark-viewed?order_id=${order.id}`, {method:'POST'}).catch(()=>{});
    }
    setSelectedOrder(order);
    setCurrentScreen('orderDetail');
  };

  const groupedProducts = categories.map(cat => ({
    category: cat.name,
    items: products.filter(p => p.category_id === cat.id)
  }));

  const cartTotal = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = products.find(p => p.id === parseInt(itemId));
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  // ==================== RENDER HELPERS ====================
  const renderShopItem = ({item}: {item: Shop}) => (
    <TouchableOpacity style={styles.card} onPress={()=>{setSelectedShop(item); setActiveTab('inventory');}}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.shop_name || item.name}</Text>
        <Text style={styles.cardSub}>{item.address || 'No address provided'}</Text>
      </View>
      <Text style={styles.badge}>Tap to View</Text>
    </TouchableOpacity>
  );

  const renderOrderItem = ({item}: {item: Order}) => {
    const isNew = !item.is_viewed && item.status === 'pending' && role === 'shopkeeper';
    return (
      <TouchableOpacity style={[styles.orderRow, isNew && styles.newOrderRow]} onPress={() => handleOrderPress(item)}>
        <View style={styles.orderInfo}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderText}>{role === 'shopkeeper' ? item.customer_name : (item.shop_name || 'Shop')}</Text>
            {isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
          </View>
          <Text style={styles.orderSub}>{item.items ? `${item.items.length} item(s)` : 'Items'} • {new Date(item.created_at).toLocaleDateString()}</Text>
          {item.items && item.items.length > 0 && (
            <Text style={styles.orderItems}>{item.items.map(i => `${i.item_name} x${i.quantity}`).join(', ')}</Text>
          )}
        </View>
        <View style={styles.orderStatusContainer}>
          <Text style={[styles.statusText, item.status === 'delivered' || item.status === 'received' ? styles.statusDelivered : styles.statusPending]}>
            {item.status === 'delivered' ? 'Delivered' : item.status === 'received' ? 'Received' : 'Pending'}
          </Text>
          {item.total && <Text style={styles.orderTotal}>₹{item.total}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  if(role==='customer' && !selectedShop) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🛍️ Nearby Shops</Text>
          <TouchableOpacity onPress={onLogout}><Text style={styles.logoutBtn}>🚪 Logout</Text></TouchableOpacity>
        </View>
        <FlatList data={shops} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No shops registered yet.</Text>}
          renderItem={renderShopItem} />
      </SafeAreaView>
    );
  }

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /><Text style={{marginTop:10}}>Loading...</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>🛒 KOTTU</Text>
          {role==='shopkeeper' ? <Text style={styles.shopName}>{user?.shop_name}</Text> : 
           <TouchableOpacity onPress={()=>setCurrentScreen('shops')}><Text style={styles.backBtn}>← Shops</Text></TouchableOpacity>}
        </View>
        <TouchableOpacity onPress={()=>setActiveTab('profile')}><Text style={styles.profileBtn}>👤 Profile</Text></TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {role==='shopkeeper' ? ['inventory','orders'].map(tab=>(
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.activeTab]} onPress={()=>setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.activeTabText]}>{tab==='inventory'?'📦 Inventory':'🧾 Orders'}</Text>
          </TouchableOpacity>
        )) : ['inventory','orders'].map(tab=>(
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.activeTab]} onPress={()=>setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.activeTabText]}>{tab==='inventory'?'📦 Inventory':'📜 My Orders'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{flex:1, backgroundColor:'#F8F9FA'}} contentContainerStyle={{padding:12, paddingBottom:80}}>
        {activeTab==='profile' && (
          <View style={styles.profileCard}>
            <Text style={styles.profileTitle}>👤 Profile</Text>
            <View style={styles.profileField}><Text style={styles.label}>Name</Text><Text style={styles.value}>{profile?.name || user?.name}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{profile?.phone || user?.phone}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Address</Text><Text style={styles.value}>{profile?.address || 'Not set'}</Text></View>
            {role==='shopkeeper' && (
              <>
                <View style={styles.profileField}><Text style={styles.label}>Total Orders</Text><Text style={styles.value}>{shopStats.total_orders}</Text></View>
                <Text style={styles.sectionTitle}>Recent Orders</Text>
                {shopStats.recent_orders.map((o: Order) => (
                  <TouchableOpacity key={o.id} style={styles.miniOrder} onPress={() => handleOrderPress(o)}>
                    <Text>{o.customer_name} • {o.items?.length || 0} item(s)</Text>
                    <Text style={{color:'#666'}}>{new Date(o.created_at).toLocaleDateString()}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {role==='customer' && (
              <>
                <Text style={styles.sectionTitle}>Order History</Text>
                {customerOrders.map(o => (
                  <TouchableOpacity key={o.id} style={styles.miniOrder} onPress={() => handleOrderPress(o)}>
                    <Text>{o.shop_name} • {o.items?.length || 0} item(s)</Text>
                    <Text style={{color:'#666'}}>{o.status}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <TouchableOpacity style={styles.editBtn} onPress={()=>{setEditProfile(true); setProfForm({name: profile?.name||'', phone: profile?.phone||'', address: profile?.address||''});}}>
              <Text style={{color:'#fff', fontWeight:'bold'}}>✏️ Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab==='inventory' && role==='shopkeeper' && (
          <View>
            <TouchableOpacity style={styles.addBtn} onPress={()=>setCatModal(true)}><Text style={{color:'#fff', fontWeight:'bold'}}>➕ Add Category</Text></TouchableOpacity>
            {groupedProducts.length === 0 ? (
              <Text style={styles.emptyText}>No categories or items yet.</Text>
            ) : (
              groupedProducts.map((group, idx) => (
                <View key={idx}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catTitle}>{group.category}</Text>
                    <TouchableOpacity onPress={()=>{
                      setItemModal(true);
                      const cat = categories.find(c => c.name === group.category);
                      setNewItem(prev => ({...prev, category_id: cat ? String(cat.id) : ''}));
                    }}><Text style={styles.addItemLink}>+ Add Item</Text></TouchableOpacity>
                  </View>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>₹{item.price} • {item.stock} left</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab==='inventory' && role==='customer' && selectedShop && (
          <View>
            {groupedProducts.length === 0 ? (
              <Text style={styles.emptyText}>This shop hasn't added categories yet.</Text>
            ) : (
              groupedProducts.map((group, idx) => (
                <View key={idx}>
                  <Text style={styles.sectionTitle}>{group.category}</Text>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemPrice}>₹{item.price}</Text>
                      </View>
                      <View style={styles.itemActions}>
                        {cart[item.id] ? (
                          <View style={styles.cartControls}>
                            <TouchableOpacity style={styles.cartBtn} onPress={()=>setCart(prev => ({...prev, [item.id]: Math.max(0, (prev[item.id]||0) - 1)}))}>
                              <Text style={styles.cartBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.cartCount}>{cart[item.id]}</Text>
                            <TouchableOpacity style={styles.cartBtn} onPress={()=>addToCart(item)}>
                              <Text style={styles.cartBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.addToCartBtn} onPress={()=>addToCart(item)} disabled={item.stock === 0}>
                            <Text style={styles.addToCartText}>{item.stock > 0 ? 'Add' : 'Out'}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
            
            {cartCount > 0 && (
              <View style={styles.cartSummary}>
                <View style={styles.cartSummaryRow}>
                  <Text style={styles.cartSummaryText}>Total ({cartCount} items):</Text>
                  <Text style={styles.cartSummaryTotal}>₹{cartTotal}</Text>
                </View>
                <TouchableOpacity style={styles.checkoutBtn} onPress={placeOrder}>
                  <Text style={styles.checkoutBtnText}>Place Order</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab==='orders' && (
          <View>
            <FlatList 
              data={role==='shopkeeper' ? orders : customerOrders} 
              keyExtractor={i=>i.id.toString()} 
              scrollEnabled={false}
              ListEmptyComponent={<Text style={styles.emptyText}>No orders yet.</Text>}
              renderItem={renderOrderItem} 
            />
          </View>
        )}
      </ScrollView>

      {/* ==================== MODALS ==================== */}
      <Modal visible={catModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Category</Text>
          <TextInput style={styles.input} placeholder="Category Name (e.g., Vegetables)" value={newCat} onChangeText={setNewCat}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setCatModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={addCategory}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={itemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Item</Text>
          <TextInput style={styles.input} placeholder="Item Name" value={newItem.name} onChangeText={v=>setNewItem({...newItem, name:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Price (₹)" value={newItem.price} onChangeText={v=>setNewItem({...newItem, price:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Stock" value={newItem.stock} onChangeText={v=>setNewItem({...newItem, stock:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setItemModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={addItem}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={editProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>✏️ Edit Profile</Text>
          <TextInput style={styles.input} placeholder="Name" value={profForm.name} onChangeText={v=>setProfForm({...profForm, name:v})}/>
          <TextInput style={styles.input} placeholder="Phone" value={profForm.phone} onChangeText={v=>setProfForm({...profForm, phone:v})}/>
          <TextInput style={styles.input} placeholder="Address" value={profForm.address} onChangeText={v=>setProfForm({...profForm, address:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setEditProfile(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={updateProfile}><Text style={[styles.btnTxt,{color:'#fff'}]}>Save</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container:{flex:1, backgroundColor:'#F8F9FA'}, 
  header:{padding:16, backgroundColor:'#2E7D32', borderBottomLeftRadius:16, borderBottomRightRadius:16},
  headerTop:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}, 
  headerTitle:{fontSize:22, fontWeight:'bold', color:'#fff'},
  shopName:{fontSize:14, color:'#E8F5E9', fontWeight:'600'}, backBtn:{color:'#fff', fontSize:14}, profileBtn:{color:'#fff', fontSize:14}, logoutBtn:{color:'#fff', fontSize:14},
  tabs:{flexDirection:'row', backgroundColor:'#fff', padding:8, borderBottomWidth:1, borderBottomColor:'#EAECEF'},
  tab:{flex:1, padding:10, alignItems:'center', borderRadius:8, marginHorizontal:2}, 
  activeTab:{backgroundColor:'#E8F5E9'}, tabText:{fontSize:13, color:'#666'}, activeTabText:{color:'#2E7D32', fontWeight:'600'},
  list:{padding:12, paddingBottom:80},
  card:{backgroundColor:'#fff', padding:16, borderRadius:12, marginBottom:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:2},
  cardContent:{flex:1}, cardTitle:{fontSize:16, fontWeight:'600', color:'#111'}, cardSub:{fontSize:13, color:'#666', marginTop:2},
  badge:{backgroundColor:'#E8F5E9', color:'#2E7D32', paddingHorizontal:10, paddingVertical:4, borderRadius:12, fontSize:12, fontWeight:'600'},
  shopCard:{backgroundColor:'#fff', padding:16, borderRadius:12, marginBottom:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:2},
  shopCardContent:{flex:1}, shopCardTitle:{fontSize:16, fontWeight:'600', color:'#111'}, shopCardSub:{fontSize:13, color:'#666', marginTop:2},
  shopBadge:{backgroundColor:'#E8F5E9', color:'#2E7D32', paddingHorizontal:10, paddingVertical:4, borderRadius:12, fontSize:12, fontWeight:'600'},
  section:{marginBottom:20}, sectionTitle:{fontSize:17, fontWeight:'600', color:'#333', marginBottom:10, marginTop:4},
  itemRow:{backgroundColor:'#fff', padding:14, borderRadius:10, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:1},
  itemInfo:{flex:1}, itemName:{fontSize:15, fontWeight:'500', color:'#333'}, itemPrice:{fontSize:14, color:'#2E7D32', fontWeight:'600', marginTop:2},
  itemActions:{flexDirection:'row', alignItems:'center'},
  addToCartBtn:{backgroundColor:'#4A90E2', paddingHorizontal:16, paddingVertical:8, borderRadius:8},
  addToCartText:{color:'#fff', fontWeight:'600', fontSize:13},
  cartControls:{flexDirection:'row', alignItems:'center', backgroundColor:'#E8F5E9', borderRadius:8},
  cartBtn:{width:32, height:32, justifyContent:'center', alignItems:'center'},
  cartBtnText:{fontSize:18, color:'#2E7D32', fontWeight:'bold'},
  cartCount:{marginHorizontal:12, fontSize:16, fontWeight:'600', color:'#2E7D32'},
  cartSummary:{backgroundColor:'#fff', padding:16, borderRadius:12, marginTop:12, elevation:2},
  cartSummaryRow:{flexDirection:'row', justifyContent:'space-between', marginBottom:12},
  cartSummaryText:{fontSize:16, fontWeight:'600', color:'#333'},
  cartSummaryTotal:{fontSize:18, fontWeight:'bold', color:'#2E7D32'},
  checkoutBtn:{backgroundColor:'#2E7D32', padding:14, borderRadius:10, alignItems:'center'},
  checkoutBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  orderRow:{backgroundColor:'#fff', padding:14, borderRadius:10, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:1},
  newOrderRow:{borderLeftWidth:4, borderLeftColor:'#FF6B6B', backgroundColor:'#FFF5F5'},
  orderInfo:{flex:1}, 
  orderHeader:{flexDirection:'row', alignItems:'center', marginBottom:4},
  orderText:{fontSize:14, fontWeight:'600', color:'#333'},
  orderSub:{fontSize:12, color:'#666'},
  orderItems:{fontSize:12, color:'#4A90E2', marginTop:4, fontWeight:'500'},
  orderStatusContainer:{alignItems:'flex-end'},
  orderStatus:{fontSize:12, paddingHorizontal:8, paddingVertical:3, borderRadius:8, fontWeight:'600'},
  statusText:{fontSize:12, fontWeight:'bold', paddingHorizontal:8, paddingVertical:3, borderRadius:8},
  statusPending:{backgroundColor:'#FFF3E0', color:'#E65100'},
  statusDelivered:{backgroundColor:'#E8F5E9', color:'#2E7D32'},
  orderTotal:{fontSize:14, fontWeight:'bold', color:'#2E7D32', marginTop:4},
  newBadge:{backgroundColor:'#FF6B6B', paddingHorizontal:6, paddingVertical:2, borderRadius:4, marginLeft:8},
  newBadgeText:{color:'#fff', fontSize:10, fontWeight:'bold'},
  profileCard:{backgroundColor:'#fff', padding:16, borderRadius:12, elevation:2}, 
  profileTitle:{fontSize:18, fontWeight:'bold', color:'#333', marginBottom:12},
  profileField:{marginBottom:12}, label:{fontSize:12, color:'#666', marginBottom:2}, value:{fontSize:15, color:'#333', fontWeight:'500'},
  miniOrder:{padding:10, backgroundColor:'#F8F9FA', borderRadius:8, marginBottom:6, flexDirection:'row', justifyContent:'space-between'},
  editBtn:{marginTop:12, padding:12, backgroundColor:'#2E7D32', borderRadius:8, alignItems:'center'},
  addBtn:{margin:12, padding:12, backgroundColor:'#4A90E2', borderRadius:10, alignItems:'center'},
  catHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}, catTitle:{fontSize:16, fontWeight:'600', color:'#333'}, addItemLink:{color:'#4A90E2', fontSize:13, fontWeight:'600'},
  emptyText:{textAlign:'center', color:'#888', marginTop:20, fontSize:14},
  detailCard:{backgroundColor:'#fff', padding:16, borderRadius:12, marginBottom:12, elevation:2},
  detailTitle:{fontSize:16, fontWeight:'bold', color:'#333', marginBottom:12},
  detailRow:{flexDirection:'row', justifyContent:'space-between', marginBottom:8},
  detailLabel:{fontSize:13, color:'#666'},
  detailValue:{fontSize:14, color:'#333', fontWeight:'500'},
  itemRowDetail:{flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#F0F0F0'},
  itemInfoDetail:{flex:1},
  itemNameDetail:{fontSize:14, fontWeight:'500', color:'#333'},
  itemQtyDetail:{fontSize:12, color:'#666', marginTop:2},
  itemPriceDetail:{fontSize:14, fontWeight:'600', color:'#2E7D32'},
  totalRow:{flexDirection:'row', justifyContent:'space-between', marginTop:12, paddingTop:12, borderTopWidth:2, borderTopColor:'#E8F5E9'},
  totalLabel:{fontSize:15, fontWeight:'bold', color:'#333'},
  totalValue:{fontSize:18, fontWeight:'bold', color:'#2E7D32'},
  statusBtn:{marginTop:16, padding:14, backgroundColor:'#2E7D32', borderRadius:10, alignItems:'center'},
  statusBtnDisabled:{backgroundColor:'#A5D6A7'},
  statusBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center'}, 
  modalContent:{width:'88%', backgroundColor:'#fff', borderRadius:16, padding:18, maxHeight:'75%'},
  modalTitle:{fontSize:18, fontWeight:'bold', marginBottom:12, color:'#333'}, 
  input:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:10, padding:12, fontSize:15, marginBottom:12, backgroundColor:'#FAFAFA'},
  modalBtns:{flexDirection:'row', justifyContent:'flex-end', gap:10}, 
  cancel:{padding:10, backgroundColor:'#F0F0F0', borderRadius:8}, 
  confirm:{padding:10, backgroundColor:'#2E7D32', borderRadius:8}, 
  btnTxt:{fontSize:14, fontWeight:'600', color:'#333'},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  authContainer:{flex:1, backgroundColor:'#F8F9FA', justifyContent:'center'},
  authBox:{margin:20, backgroundColor:'#fff', borderRadius:16, padding:24, elevation:3},
  authTitle:{fontSize:26, fontWeight:'bold', textAlign:'center', color:'#2E7D32'},
  authSub:{fontSize:13, textAlign:'center', color:'#666', marginBottom:16},
  authToggle:{fontSize:16, fontWeight:'600', marginBottom:14, color:'#333'},
  authInput:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:10, padding:12, marginBottom:12, fontSize:15, backgroundColor:'#FAFAFA'},
  roleBox:{flexDirection:'row', gap:10, marginBottom:12},
  roleBtn:{flex:1, padding:10, borderRadius:10, backgroundColor:'#F0F0F0', alignItems:'center'},
  roleActive:{backgroundColor:'#E8F5E9', borderWidth:1, borderColor:'#2E7D32'}, roleTxt:{fontWeight:'600', color:'#333'},
  authBtn:{backgroundColor:'#2E7D32', padding:14, borderRadius:10, alignItems:'center', marginTop:8},
  authBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  authSwitch:{textAlign:'center', marginTop:16, color:'#4A90E2', fontWeight:'500'}
});