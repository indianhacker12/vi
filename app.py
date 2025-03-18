import uuid
from flask import Flask, render_template, redirect, url_for, request, session
from flask_socketio import SocketIO, join_room, leave_room, rooms, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variable to keep track of waiting users
waiting_users = []

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/find-match')
def find_match():
    # Generate a unique ID for this user
    user_id = str(uuid.uuid4())
    session['user_id'] = user_id
    
    # Check if there's another user waiting
    if waiting_users:
        # Get the first waiting user
        partner_id = waiting_users.pop(0)
        # Create a new room
        room_id = str(uuid.uuid4())[:8]
        return redirect(url_for('room', room_id=room_id, partner_id=partner_id))
    else:
        # Add this user to waiting list
        waiting_users.append(user_id)
        return redirect(url_for('waiting'))

@app.route('/waiting')
def waiting():
    if 'user_id' not in session:
        return redirect(url_for('home'))
    return render_template('waiting.html', user_id=session['user_id'])

@app.route('/room/<room_id>')
def room(room_id):
    partner_id = request.args.get('partner_id')
    return render_template('room.html', room_id=room_id, partner_id=partner_id)

@app.route('/leave')
def leave():
    # Remove user from waiting list if they're there
    if 'user_id' in session and session['user_id'] in waiting_users:
        waiting_users.remove(session['user_id'])
    return redirect(url_for('home'))

# WebRTC signaling for rooms
@socketio.on('join-room')
def on_join(data):
    room = data['room']
    join_room(room)
    socketio.emit('user-joined', {'message': f"A new user joined room {room}"}, room=room)

@socketio.on('leave-room')
def on_leave(data):
    room = data['room']
    leave_room(room)
    socketio.emit('user-left', {'message': f"A user left room {room}"}, room=room)

@socketio.on('waiting-check')
def handle_waiting_check(data):
    user_id = data['user_id']
    
    # If user is still in waiting list but someone else is also waiting
    if user_id in waiting_users and len(waiting_users) > 1:
        # Make sure this user is not the first in line (avoid matching with self)
        if waiting_users[0] != user_id:
            # Match with the first waiting user
            partner_id = waiting_users[0]
            waiting_users.remove(user_id)
            waiting_users.remove(partner_id)
            
            # Create a new room
            room_id = str(uuid.uuid4())[:8]
            
            # Notify both users
            emit('match-found', {'room_id': room_id, 'partner_id': partner_id})
            socketio.emit('match-found', {'room_id': room_id, 'partner_id': user_id}, room=partner_id)

@socketio.on('disconnect')
def handle_disconnect():
    # Remove user from waiting list if they disconnect
    if 'user_id' in session and session['user_id'] in waiting_users:
        waiting_users.remove(session['user_id'])

@socketio.on('offer')
def handle_offer(data):
    socketio.emit('offer', data, room=data['room'])

@socketio.on('answer')
def handle_answer(data):
    socketio.emit('answer', data, room=data['room'])

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    socketio.emit('ice-candidate', data, room=data['room'])

@socketio.on('chat-message')
def handle_chat_message(data):
    socketio.emit('chat-message', data, room=data['room'], include_sender=False)

if __name__ == '__main__':
    socketio.run(app, debug=True)
