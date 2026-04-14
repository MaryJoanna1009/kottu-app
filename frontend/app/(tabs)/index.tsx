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
  items?: OrderItem[];
  status: string; 
  is_viewed?: boolean;
  created_at: string; 
  shop_name?: string;
  shop_address?: string;
  shop_phone?: string;
};
type ProfileData = { name: string; phone: string; address: string; shop_name?: string };

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', role: 'customer' as 'customer' | 'shopkeeper', shop_name: '', address: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

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
    setFormData({ name: '', phone: '', password: '', role: 'customer', shop_name: '', address: '' });
  };

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#E67E22" /><Text style={{marginTop:10, color:'#666'}}>Connecting...</Text></View>;
  if(!user) return <AuthScreen isLogin={isLogin} setIsLogin={setIsLogin} formData={formData} setFormData={setFormData} handleAuth={handleAuth} authLoading={authLoading} />;

  return <MainApp user={user} selectedShop={selectedShop} setSelectedShop={setSelectedShop} onLogout={logout} />;
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
        <ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', padding:24}}>
          <View style={styles.authHeader}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>🛒</Text>
            </View>
            <Text style={styles.authTitle}>Kottu</Text>
            <Text style={styles.authSubtitle}>Your Neighbourhood Kirana</Text>
          </View>

          <View style={styles.authCard}>
            <Text style={styles.authWelcome}>Welcome back 👋</Text>
            
            <TextInput style={styles.authInput} placeholder="Phone Number" keyboardType="phone-pad" value={formData.phone} onChangeText={v=>setFormData({...formData, phone:v})} />
            <TextInput style={styles.authInput} placeholder="Password" secureTextEntry value={formData.password} onChangeText={v=>setFormData({...formData, password:v})} />
            
            {!isLogin && (
              <>
                <TextInput style={styles.authInput} placeholder="Full Name" value={formData.name} onChangeText={v=>setFormData({...formData, name:v})} />
                <View style={styles.roleToggle}>
                  <TouchableOpacity style={[styles.roleToggleBtn, formData.role==='customer' && styles.roleToggleActive]} onPress={()=>setFormData({...formData, role:'customer'})}>
                    <Text style={[styles.roleToggleText, formData.role==='customer' && styles.roleToggleTextActive]}>🛍️ Customer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.roleToggleBtn, formData.role==='shopkeeper' && styles.roleToggleActive]} onPress={()=>setFormData({...formData, role:'shopkeeper'})}>
                    <Text style={[styles.roleToggleText, formData.role==='shopkeeper' && styles.roleToggleTextActive]}>🏪 Shopkeeper</Text>
                  </TouchableOpacity>
                </View>
                {formData.role==='shopkeeper' && <TextInput style={styles.authInput} placeholder="Shop Name" value={formData.shop_name} onChangeText={v=>setFormData({...formData, shop_name:v})} />}
                <TextInput style={styles.authInput} placeholder="Address" value={formData.address} onChangeText={v=>setFormData({...formData, address:v})} />
              </>
            )}

            <TouchableOpacity style={styles.authBtn} onPress={handleAuth} disabled={authLoading}>
              <Text style={styles.authBtnText}>{authLoading ? '...' : (isLogin ? 'Login →' : 'Create Account')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={()=>setIsLogin(!isLogin)}>
              <Text style={styles.authSwitch}>
                {isLogin ? "New here? Create Account" : "Have account? Login"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==================== MAIN APP ====================
function MainApp({ user, selectedShop, setSelectedShop, onLogout }: {
  user: User; selectedShop: Shop | null; setSelectedShop: (v: Shop | null) => void; onLogout: () => Promise<void>;
}) {
  const [role] = useState<'customer' | 'shopkeeper'>(user?.role || 'customer');
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(role==='shopkeeper' ? 'inventory' : 'shops');
  
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [newItem, setNewItem] = useState({name:'', price:'', stock:'', category_id:''});
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [custName, setCustName] = useState(user?.name || '');
  const [qty, setQty] = useState('1');
  
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);

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
      
      const profRes = await fetch(`${API_URL}/api/profile?user_id=${user?.id}&role=${role}`).then(r=>r.json());
      setProfile(profRes?.profile || null);

      if(role === 'shopkeeper') {
        const ordRes = await fetch(`${API_URL}/api/orders?shop_id=${shopId}`).then(r=>r.json());
        setOrders(ordRes as Order[]);
      } else {
        const custOrdRes = await fetch(`${API_URL}/api/customer/orders?customer_phone=${user?.phone}&shop_id=${shopId}`).then(r=>r.json());
        setCustomerOrders(custOrdRes as Order[]);
      }
    } catch(e: any) { console.log('Fetch error:', e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if(role==='customer' && !selectedShop) {
      setLoading(true);
      fetch(`${API_URL}/api/shops`).then(r=>r.json()).then(setShops).finally(()=>setLoading(false));
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

  const placeOrder = async () => {
    const finalName = custName.trim() || user?.name || 'Guest';
    if(!finalName || !orderModal || !shopId) return Alert.alert('Error', 'Enter your name');
    if(!qty || parseInt(qty) <= 0) return Alert.alert('Error', 'Enter valid quantity');
    
    try {
      const res = await fetch(`${API_URL}/api/orders?shop_id=${shopId}&item_id=${orderModal.id}&customer_name=${encodeURIComponent(finalName)}&customer_phone=${user?.phone || ''}&customer_address=${encodeURIComponent(user?.address || '')}&quantity=${parseInt(qty)}`, {method:'POST'});
      const data = await res.json();
      if(data.error) return Alert.alert('Failed', data.error);
      Alert.alert('Success', `Ordered ${qty}x ${orderModal.name}`);
      setOrderModal(null); setCustName(user?.name || ''); setQty('1'); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const viewOrderDetail = async (orderId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/order/detail?order_id=${orderId}`);
      const data = await res.json();
      if(data) {
        setSelectedOrderDetail(data);
        setShowOrderDetail(true);
        if(role === 'shopkeeper') {
          await fetch(`${API_URL}/api/order/mark-viewed?order_id=${orderId}`, {method:'POST'});
          fetchData();
        }
      }
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      await fetch(`${API_URL}/api/order/update-status?order_id=${orderId}&status=${status}`, {method:'POST'});
      Alert.alert('Success', `Order ${status}`);
      setShowOrderDetail(false);
      fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const groupedProducts = categories.map(cat => ({
    category: cat.name,
    items: products.filter(p => p.category_id === cat.id)
  }));

  const renderShopItem = ({item}: {item: Shop}) => (
    <TouchableOpacity style={styles.shopCard} onPress={()=>{setSelectedShop(item); setActiveTab('inventory');}}>
      <View style={styles.shopIconCircle}>
        <Text style={styles.shopIcon}>🏪</Text>
      </View>
      <View style={styles.shopInfo}>
        <Text style={styles.shopName}>{item.shop_name || item.name}</Text>
        <Text style={styles.shopAddress}>{item.address || 'No address'}</Text>
      </View>
      <View style={styles.tapBadge}>
        <Text style={styles.tapText}>Tap to View</Text>
      </View>
    </TouchableOpacity>
  );

  const renderOrderItem = ({item}: {item: Order}) => {
    const isNew = !item.is_viewed && item.status === 'pending' && role === 'shopkeeper';
    return (
      <TouchableOpacity style={[styles.orderCard, isNew && styles.orderCardNew]} onPress={() => viewOrderDetail(item.id)}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderCustomer}>{role === 'shopkeeper' ? item.customer_name : (item.shop_name || 'Shop')}</Text>
          {isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
          <Text style={[styles.orderStatus, item.status === 'delivered' ? styles.statusDelivered : item.status === 'received' ? styles.statusReceived : styles.statusPending]}>
            {item.status === 'delivered' ? 'Delivered' : item.status === 'received' ? 'Received' : 'Pending'}
          </Text>
        </View>
        <Text style={styles.orderItems}>
          {item.items ? `${item.items.map(i => `${i.item_name} x${i.quantity}`).join(', ')}` : 'Items'}
        </Text>
        <View style={styles.orderFooter}>
          <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleString()}</Text>
          {item.items && <Text style={styles.orderTotal}>₹{item.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // Customer Shop List
  if(role==='customer' && !selectedShop) {
    if (activeTab === 'profile') {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" />
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Kottu</Text>
              <Text style={styles.headerSub}>Hyderabad, Telangana</Text>
            </View>
            <View style={styles.profileCircle}><Text style={styles.profileCircleText}>{user?.name?.charAt(0) || 'A'}</Text></View>
          </View>
          <ScrollView style={{flex:1}} contentContainerStyle={{padding:16}}>
            <View style={styles.profileCard}>
              <Text style={styles.profileCardTitle}>👤 Profile</Text>
              <View style={styles.profileField}><Text style={styles.label}>Name</Text><Text style={styles.value}>{user?.name}</Text></View>
              <View style={styles.profileField}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{user?.phone}</Text></View>
              <View style={styles.profileField}><Text style={styles.label}>Address</Text><Text style={styles.value}>{user?.address || 'Not set'}</Text></View>
            </View>
          </ScrollView>
          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navBtn} onPress={()=>setActiveTab('shops')}><Text style={styles.navIcon}>🏪</Text><Text style={styles.navText}>Shops</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={()=>setActiveTab('orders')}><Text style={styles.navIcon}>📜</Text><Text style={styles.navText}>Orders</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]}><Text style={styles.navIcon}>👤</Text><Text style={[styles.navText, styles.navTextActive]}>Profile</Text></TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Kottu</Text>
            <Text style={styles.headerSub}>Hyderabad, Telangana</Text>
          </View>
          <View style={styles.profileCircle}><Text style={styles.profileCircleText}>{user?.name?.charAt(0) || 'A'}</Text></View>
        </View>
        <Text style={styles.sectionHeader}>SHOPS NEAR YOU</Text>
        <FlatList data={shops} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No shops registered yet.</Text>}
          renderItem={renderShopItem} />
        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navBtn, styles.navBtnActive]}><Text style={styles.navIcon}>🏪</Text><Text style={[styles.navText, styles.navTextActive]}>Shops</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={()=>setActiveTab('orders')}><Text style={styles.navIcon}>📜</Text><Text style={styles.navText}>Orders</Text></TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={()=>setActiveTab('profile')}><Text style={styles.navIcon}>👤</Text><Text style={styles.navText}>Profile</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#E67E22" /><Text style={{marginTop:10}}>Loading...</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{flexDirection:'row', alignItems:'center'}}>
            {role==='customer' && selectedShop && (
              <TouchableOpacity onPress={()=>{setSelectedShop(null); setActiveTab('shops');}} style={{marginRight:8}}>
                <Text style={{color:'#fff', fontSize:18}}>←</Text>
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.headerTitle}>Kottu</Text>
              <Text style={styles.headerSub}>{role==='shopkeeper' ? user?.shop_name : selectedShop?.shop_name || 'Your Neighbourhood Kirana'}</Text>
            </View>
          </View>
          <View style={styles.profileCircle}><Text style={styles.profileCircleText}>{user?.name?.charAt(0) || 'A'}</Text></View>
        </View>
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        {role==='shopkeeper' ? (
          <>
            <TouchableOpacity style={[styles.tab, activeTab==='inventory' && styles.activeTab]} onPress={()=>setActiveTab('inventory')}>
              <Text style={[styles.tabText, activeTab==='inventory' && styles.activeTabText]}>Inventory</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab==='orders' && styles.activeTab]} onPress={()=>setActiveTab('orders')}>
              <Text style={[styles.tabText, activeTab==='orders' && styles.activeTabText]}>Orders</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.tab, activeTab==='inventory' && styles.activeTab]} onPress={()=>setActiveTab('inventory')}>
              <Text style={[styles.tabText, activeTab==='inventory' && styles.activeTabText]}>Inventory</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab==='orders' && styles.activeTab]} onPress={()=>setActiveTab('orders')}>
              <Text style={[styles.tabText, activeTab==='orders' && styles.activeTabText]}>My Orders</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView style={{flex:1}} contentContainerStyle={{padding:12, paddingBottom:80}}>
        {activeTab==='profile' && (
          <View style={styles.profileCard}>
            <Text style={styles.profileCardTitle}>👤 Profile</Text>
            <View style={styles.profileField}><Text style={styles.label}>Name</Text><Text style={styles.value}>{profile?.name || user?.name}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{profile?.phone || user?.phone}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Address</Text><Text style={styles.value}>{profile?.address || user?.address || 'Not set'}</Text></View>
            {role==='shopkeeper' && profile?.shop_name && (
              <View style={styles.profileField}><Text style={styles.label}>Shop Name</Text><Text style={styles.value}>{profile.shop_name}</Text></View>
            )}
            <Text style={{marginTop:12, fontSize:12, color:'#888', textAlign:'center'}}>Profile details cannot be edited after registration.</Text>
          </View>
        )}

        {activeTab==='inventory' && role==='shopkeeper' && (
          <View>
            <TouchableOpacity style={styles.addBtn} onPress={()=>setCatModal(true)}>
              <Text style={styles.addBtnText}>➕ Add Category</Text>
            </TouchableOpacity>
            {groupedProducts.length === 0 ? (
              <Text style={styles.emptyText}>No categories or items yet.</Text>
            ) : (
              groupedProducts.map((group, idx) => (
                <View key={idx} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>{group.category}</Text>
                    <TouchableOpacity onPress={()=>{
                      setItemModal(true);
                      const cat = categories.find(c => c.name === group.category);
                      setNewItem(prev => ({...prev, category_id: cat ? String(cat.id) : ''}));
                    }}><Text style={styles.addItemLink}>+ Add Item</Text></TouchableOpacity>
                  </View>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemStock}>{item.stock} left</Text>
                      </View>
                      <Text style={styles.itemPrice}>₹{item.price}</Text>
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
                <View key={idx} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>{group.category}</Text>
                  {group.items.map((item) => (
                    <TouchableOpacity key={item.id} style={styles.itemRow} onPress={()=> item.stock>0 ? setOrderModal(item) : null}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemStock}>{item.stock} left</Text>
                      </View>
                      <View style={styles.itemRight}>
                        <Text style={styles.itemPrice}>₹{item.price}</Text>
                        <TouchableOpacity style={[styles.orderBtn, item.stock===0 && styles.orderBtnDisabled]} onPress={(e)=>{e.stopPropagation(); item.stock>0 && setOrderModal(item);}}>
                          <Text style={styles.orderBtnText}>{item.stock>0 ? 'Order' : 'Out'}</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab==='orders' && (
          <FlatList 
            data={role==='shopkeeper' ? orders : customerOrders} 
            keyExtractor={i=>i.id.toString()} 
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.emptyText}>No orders yet.</Text>}
            renderItem={renderOrderItem} 
          />
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={[styles.navBtn, activeTab==='inventory' && styles.navBtnActive]} onPress={()=>setActiveTab('inventory')}>
          <Text style={styles.navIcon}>📦</Text>
          <Text style={[styles.navText, activeTab==='inventory' && styles.navTextActive]}>Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navBtn, activeTab==='orders' && styles.navBtnActive]} onPress={()=>setActiveTab('orders')}>
          <Text style={styles.navIcon}>📜</Text>
          <Text style={[styles.navText, activeTab==='orders' && styles.navTextActive]}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navBtn, activeTab==='profile' && styles.navBtnActive]} onPress={()=>setActiveTab('profile')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={[styles.navText, activeTab==='profile' && styles.navTextActive]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ==================== MODALS ==================== */}
      <Modal visible={catModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Category</Text>
          <TextInput style={styles.input} placeholder="Category Name (e.g., Vegetables)" value={newCat} onChangeText={setNewCat}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancelBtn} onPress={()=>setCatModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirmBtn} onPress={addCategory}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={itemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Item</Text>
          <TextInput style={styles.input} placeholder="Item Name" value={newItem.name} onChangeText={v=>setNewItem({...newItem, name:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Price (₹)" value={newItem.price} onChangeText={v=>setNewItem({...newItem, price:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Stock" value={newItem.stock} onChangeText={v=>setNewItem({...newItem, stock:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancelBtn} onPress={()=>setItemModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirmBtn} onPress={addItem}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={!!orderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.orderModal}>
            <Text style={styles.modalTitle}>Place Order 🛒</Text>
            <Text style={{marginBottom:12, color:'#666'}}>{orderModal?.name} — ₹{orderModal?.price} each</Text>
            <TextInput style={styles.input} placeholder="Your Name" value={custName} onChangeText={setCustName}/>
            <TextInput style={styles.input} keyboardType="numeric" placeholder="Quantity (e.g. 2)" value={qty} onChangeText={setQty}/>
            {orderModal && qty && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>₹{orderModal.price * parseInt(qty || '0')}</Text>
              </View>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={()=>setOrderModal(null)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={placeOrder}><Text style={[styles.btnTxt,{color:'#fff'}]}>Confirm Order →</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Order Detail Modal */}
      <Modal visible={showOrderDetail} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📦 Order #{selectedOrderDetail?.order?.id}</Text>
            
            {role === 'shopkeeper' ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>👤 Customer</Text>
                <Text style={styles.detailText}>Name: {selectedOrderDetail?.order?.customer_name}</Text>
                <Text style={styles.detailText}>Phone: {selectedOrderDetail?.order?.customer_phone}</Text>
                {selectedOrderDetail?.order?.customer_address && <Text style={styles.detailText}>Address: {selectedOrderDetail.order.customer_address}</Text>}
              </View>
            ) : (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>🏪 Shop</Text>
                <Text style={styles.detailText}>Name: {selectedOrderDetail?.order?.shop_name}</Text>
                <Text style={styles.detailText}>Phone: {selectedOrderDetail?.order?.shop_phone}</Text>
                {selectedOrderDetail?.order?.shop_address && <Text style={styles.detailText}>Address: {selectedOrderDetail.order.shop_address}</Text>}
              </View>
            )}
            
            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>📦 Items</Text>
              {selectedOrderDetail?.items?.map((item: any, idx: number) => (
                <View key={idx} style={styles.itemDetailRow}>
                  <Text style={styles.itemDetailName}>{item.item_name}</Text>
                  <Text style={styles.itemDetailQty}>Qty: {item.quantity}</Text>
                  <Text style={styles.itemDetailPrice}>₹{item.price * item.quantity}</Text>
                </View>
              ))}
            </View>
            
            {role === 'shopkeeper' && (
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={()=>setShowOrderDetail(false)}>
                  <Text style={styles.btnTxt}>Close</Text>
                </TouchableOpacity>
                {selectedOrderDetail?.order?.status === 'pending' ? (
                  <TouchableOpacity style={styles.confirmBtn} onPress={()=>updateOrderStatus(selectedOrderDetail.order.id, 'delivered')}>
                    <Text style={[styles.btnTxt,{color:'#fff'}]}>Mark Delivered ✓</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.confirmBtn} onPress={()=>updateOrderStatus(selectedOrderDetail.order.id, 'pending')}>
                    <Text style={[styles.btnTxt,{color:'#fff'}]}>Mark Pending</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {role === 'customer' && (
              <TouchableOpacity style={styles.confirmBtn} onPress={()=>setShowOrderDetail(false)}>
                <Text style={[styles.btnTxt,{color:'#fff'}]}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container:{flex:1, backgroundColor:'#FDF6E3'},
  header:{backgroundColor:'#5D4037', padding:16, paddingTop:40, borderBottomLeftRadius:16, borderBottomRightRadius:16},
  headerRow:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  headerTitle:{fontSize:24, fontWeight:'bold', color:'#fff'},
  headerSub:{fontSize:13, color:'#D7CCC8', marginTop:2},
  profileCircle:{width:36, height:36, borderRadius:18, backgroundColor:'#E67E22', justifyContent:'center', alignItems:'center'},
  profileCircleText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  sectionHeader:{fontSize:12, fontWeight:'bold', color:'#8D6E63', letterSpacing:1, padding:16, paddingBottom:8},
  tabs:{flexDirection:'row', backgroundColor:'#fff', padding:6, margin:12, borderRadius:12, elevation:2},
  tab:{flex:1, padding:10, alignItems:'center', borderRadius:10},
  activeTab:{backgroundColor:'#E67E22'},
  tabText:{fontSize:13, color:'#8D6E63', fontWeight:'600'},
  activeTabText:{color:'#fff'},
  list:{padding:12, paddingBottom:20},
  shopCard:{backgroundColor:'#fff', padding:16, borderRadius:16, marginBottom:12, flexDirection:'row', alignItems:'center', elevation:2, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4},
  shopIconCircle:{width:48, height:48, borderRadius:24, backgroundColor:'#FFF3E0', justifyContent:'center', alignItems:'center', marginRight:12},
  shopIcon:{fontSize:24},
  shopInfo:{flex:1},
  shopName:{fontSize:16, fontWeight:'bold', color:'#3E2723'},
  shopAddress:{fontSize:13, color:'#8D6E63', marginTop:2},
  tapBadge:{backgroundColor:'#FFF3E0', paddingHorizontal:10, paddingVertical:4, borderRadius:12},
  tapText:{fontSize:11, color:'#E65100', fontWeight:'600'},
  categorySection:{marginBottom:16},
  categoryTitle:{fontSize:14, fontWeight:'bold', color:'#5D4037', marginBottom:8, marginTop:8},
  categoryHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8},
  addItemLink:{color:'#E67E22', fontSize:13, fontWeight:'600'},
  itemRow:{backgroundColor:'#fff', padding:14, borderRadius:12, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:1},
  itemInfo:{flex:1},
  itemName:{fontSize:15, fontWeight:'600', color:'#3E2723'},
  itemStock:{fontSize:12, color:'#8D6E63', marginTop:2},
  itemPrice:{fontSize:15, fontWeight:'bold', color:'#E67E22'},
  itemRight:{alignItems:'flex-end'},
  orderBtn:{backgroundColor:'#E67E22', paddingHorizontal:12, paddingVertical:6, borderRadius:8, marginTop:4},
  orderBtnText:{color:'#fff', fontSize:12, fontWeight:'bold'},
  orderBtnDisabled:{backgroundColor:'#BCAAA4'},
  orderCard:{backgroundColor:'#fff', padding:16, borderRadius:16, marginBottom:12, elevation:2},
  orderCardNew:{borderLeftWidth:4, borderLeftColor:'#E67E22'},
  orderHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8},
  orderCustomer:{fontSize:16, fontWeight:'bold', color:'#3E2723'},
  newBadge:{backgroundColor:'#FF5252', paddingHorizontal:8, paddingVertical:2, borderRadius:8},
  newBadgeText:{color:'#fff', fontSize:10, fontWeight:'bold'},
  orderStatus:{fontSize:12, fontWeight:'600', paddingHorizontal:8, paddingVertical:3, borderRadius:8},
  statusPending:{backgroundColor:'#FFF3E0', color:'#E65100'},
  statusDelivered:{backgroundColor:'#E8F5E9', color:'#2E7D32'},
  statusReceived:{backgroundColor:'#E3F2FD', color:'#1565C0'},
  orderItems:{fontSize:13, color:'#5D4037', marginBottom:8},
  orderFooter:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  orderDate:{fontSize:11, color:'#8D6E63'},
  orderTotal:{fontSize:16, fontWeight:'bold', color:'#E67E22'},
  profileCard:{backgroundColor:'#fff', padding:16, borderRadius:16, elevation:2, marginBottom:12},
  profileCardTitle:{fontSize:18, fontWeight:'bold', color:'#3E2723', marginBottom:12},
  profileField:{marginBottom:12},
  label:{fontSize:12, color:'#8D6E63', marginBottom:2},
  value:{fontSize:15, color:'#3E2723', fontWeight:'500'},
  addBtn:{backgroundColor:'#E67E22', padding:14, borderRadius:12, alignItems:'center', marginBottom:12},
  addBtnText:{color:'#fff', fontWeight:'bold', fontSize:14},
  emptyText:{textAlign:'center', color:'#8D6E63', marginTop:20, fontSize:14},
  bottomNav:{flexDirection:'row', backgroundColor:'#fff', paddingVertical:8, borderTopWidth:1, borderTopColor:'#EEE'},
  navBtn:{flex:1, alignItems:'center', paddingVertical:4},
  navBtnActive:{},
  navIcon:{fontSize:20, marginBottom:2},
  navText:{fontSize:11, color:'#8D6E63'},
  navTextActive:{color:'#E67E22', fontWeight:'bold'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, maxHeight:'70%'},
  orderModal:{backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, maxHeight:'60%'},
  modalTitle:{fontSize:18, fontWeight:'bold', color:'#3E2723', marginBottom:12},
  input:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, padding:12, fontSize:15, marginBottom:12, backgroundColor:'#FAFAFA'},
  modalBtns:{flexDirection:'row', justifyContent:'space-between', gap:12, marginTop:8},
  cancelBtn:{flex:1, padding:12, backgroundColor:'#F5F5F5', borderRadius:12, alignItems:'center'},
  confirmBtn:{flex:1, padding:12, backgroundColor:'#E67E22', borderRadius:12, alignItems:'center'},
  btnTxt:{fontSize:14, fontWeight:'600'},
  totalRow:{flexDirection:'row', justifyContent:'space-between', backgroundColor:'#FFF3E0', padding:12, borderRadius:8, marginBottom:12},
  totalLabel:{fontSize:14, color:'#5D4037'},
  totalValue:{fontSize:16, fontWeight:'bold', color:'#E67E22'},
  detailSection:{marginBottom:16, paddingBottom:16, borderBottomWidth:1, borderBottomColor:'#EEE'},
  detailTitle:{fontSize:14, fontWeight:'bold', color:'#3E2723', marginBottom:8},
  detailText:{fontSize:13, color:'#5D4037', marginBottom:4},
  itemDetailRow:{flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#F5F5F5'},
  itemDetailName:{fontSize:13, fontWeight:'500', color:'#3E2723', flex:1},
  itemDetailQty:{fontSize:13, color:'#8D6E63', marginHorizontal:12},
  itemDetailPrice:{fontSize:13, fontWeight:'600', color:'#E67E22'},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  authContainer:{flex:1, backgroundColor:'#5D4037'},
  authHeader:{alignItems:'center', marginBottom:32, marginTop:20},
  logoCircle:{width:64, height:64, borderRadius:32, backgroundColor:'#E67E22', justifyContent:'center', alignItems:'center', marginBottom:12},
  logoIcon:{fontSize:32},
  authTitle:{fontSize:28, fontWeight:'bold', color:'#fff'},
  authSubtitle:{fontSize:14, color:'#D7CCC8'},
  authCard:{backgroundColor:'#FDF6E3', borderRadius:20, padding:24, elevation:4},
  authWelcome:{fontSize:20, fontWeight:'bold', color:'#3E2723', marginBottom:16},
  authInput:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:12, padding:14, marginBottom:12, fontSize:15, backgroundColor:'#fff'},
  roleToggle:{flexDirection:'row', gap:8, marginBottom:12},
  roleToggleBtn:{flex:1, padding:10, borderRadius:12, backgroundColor:'#F5F5F5', alignItems:'center'},
  roleToggleActive:{backgroundColor:'#E67E22'},
  roleToggleText:{fontWeight:'600', color:'#8D6E63'},
  roleToggleTextActive:{color:'#fff'},
  authBtn:{backgroundColor:'#E67E22', padding:16, borderRadius:12, alignItems:'center', marginTop:8},
  authBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  authSwitch:{textAlign:'center', marginTop:16, color:'#E67E22', fontWeight:'500'}
});