'use client';

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Login from "@/app/(auth-pages)/sign-in/page"; // Adjust the path as needed
import { getUser } from "@/utils/auth"; // Add appropriate Supabase user-fetching logic

export default function LandingPage() {
    const [isLoginModalOpen, setLoginModalOpen] = useState(false);
    const user = getUser(); // Check if the user is authenticated

    const handleOpenModal = () => setLoginModalOpen(true);
    const handleCloseModal = () => setLoginModalOpen(false);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold">Welcome to Next.js Supabase Starter</h1>
            <p className="text-lg mt-4">The fastest way to build apps with Supabase and Next.js</p>

            {user ? (
                <div className="mt-8">
                    <p>Hey, {user.email}!</p>
                    <button
                        className="mt-4 px-4 py-2 bg-red-500 text-white rounded"
                        onClick={() => {
                            // Sign out logic
                            window.location.href = "/sign-out";
                        }}
                    >
                        Sign Out
                    </button>
                </div>
            ) : (
                <div className="mt-8">
                    <button
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                        onClick={handleOpenModal}
                    >
                        Sign In
                    </button>
                </div>
            )}

            {/* Login Modal */}
            <Modal isOpen={isLoginModalOpen} onClose={handleCloseModal}>
                <Login />
            </Modal>
        </div>
    );
}
