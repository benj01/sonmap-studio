// Updated Landing Page (page.tsx)
'use client';

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import Login from "@/app/(auth-pages)/sign-in/page";
import { getUser, signOut } from "@/utils/auth";

export default function LandingPage() {
    // Fetch the user on load
    useEffect(() => {
        const fetchUser = async () => {
            const fetchedUser = await getUser();
            setUser(fetchedUser);
        };
        fetchUser();
    }, []);

    const handleLoginModalOpen = () => setLoginModalOpen(true);
    const handleLoginModalClose = () => setLoginModalOpen(false);

    const handleSignOut = async () => {
        await signOut();
        setUser(null); // Reset user state after signing out
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold">Welcome to Next.js Supabase Starter</h1>
            <p className="text-lg mt-4">The fastest way to build apps with Supabase and Next.js</p>

            {user ? (
                <div className="mt-8">
                    <Dropdown
                        button={<span className="text-xl font-bold uppercase">{user.email[0]}</span>} // Show user initial
                    >
                        <button
                            onClick={handleSignOut}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        >
                            Sign Out
                        </button>
                    </Dropdown>
                </div>
            ) : (
                <div className="mt-8">
                    <button
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                        onClick={handleLoginModalOpen}
                    >
                        Sign In
                    </button>
                </div>
            )}

            {/* Login Modal */}
            <Modal isOpen={isLoginModalOpen} onClose={handleLoginModalClose}>
                <Login />
            </Modal>
        </div>
    );
}
